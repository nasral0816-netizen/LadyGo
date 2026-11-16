
import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';

import { StatusBar } from 'expo-status-bar';
import { supabase, isConfigured } from './src/supabase';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline } from 'react-native-maps';

const PINK = '#E85D88';
const PALE = '#FFF4F7';
const DARK = '#28232A';
const PHONE = '+79911121227';
const SUPPORT_EMAIL = 'ladygosupport@gmail.com';

function Button({ title, onPress, secondary = false, disabled = false }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[
        styles.buttonText,
        secondary && { color: PINK },
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline,
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor="#A69AA0"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
        style={[
          styles.input,
          multiline && styles.multiline,
        ]}
      />
    </View>
  );
}

function SectionTitle({ children }) {
  return <Text style={styles.heading}>{children}</Text>;
}

function Status({ value }) {
  return (
    <View style={styles.statusPill}>
      <Text style={styles.status}>
        {statusLabel(value)}
      </Text>
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [screen, setScreen] = useState('home');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [when, setWhen] = useState('Как можно скорее');
  const [notes, setNotes] = useState('');

  const [pickupCoords, setPickupCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);

  const [orders, setOrders] = useState([]);
  const [fare, setFare] = useState({});

  const isDriver = profile?.role === 'driver' || profile?.role === 'admin';

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      Alert.alert('Ошибка профиля', error.message);
    }

    setProfile(data || null);
    setLoading(false);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!session || !profile || !supabase) return;

    setRefreshing(true);

    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!isDriver) {
      query = query.eq('passenger_id', session.user.id);
    }

    const { data, error } = await query;

    if (error) {
      Alert.alert('Не удалось загрузить поездки', error.message);
    } else {
      setOrders(data || []);
    }

    setRefreshing(false);
  }, [session, profile, isDriver]);

  // Авторизация и восстановление сессии
  useEffect(() => {
    if (!isConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function initialize() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        Alert.alert('Авторизация', error.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        setSession(data.session);
        await loadProfile(data.session.user.id);
      } else {
        setLoading(false);
      }
    }

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);

      if (nextSession) {
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          Promise.resolve().then(() =>
            loadProfile(nextSession.user.id)
          );
        }
      } else {
        setProfile(null);
        setOrders([]);
        setLoading(false);
        setScreen('home');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Ссылка подтверждения электронной почты
  useEffect(() => {
    if (!isConfigured || !supabase) return;

    async function handleUrl(url) {
      if (!url || !url.startsWith('ladygo://')) return;

      try {
        const parsed = new URL(url);
        const errorDescription =
          parsed.searchParams.get('error_description');

        if (errorDescription) {
          Alert.alert('Ошибка подтверждения', errorDescription);
          return;
        }

        const code = parsed.searchParams.get('code');

        if (!code) return;

        const { error } =
          await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          Alert.alert('Ошибка подтверждения', error.message);
        }
      } catch (error) {
        Alert.alert('Ошибка', 'Не удалось обработать ссылку.');
      }
    }

    Linking.getInitialURL().then(handleUrl);

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => subscription.remove();
  }, []);

  // Первичная загрузка и обновление заявок
  useEffect(() => {
    if (session && profile) {
      loadOrders();
    }
  }, [session, profile, loadOrders]);

  // Обновление заказов в реальном времени
  useEffect(() => {
    if (!session || !profile || !supabase) return;

    const channel = supabase
      .channel('ladygo-orders-' + session.user.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => loadOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, profile, loadOrders]);

  // Регистрация
  async function signUp() {
    if (!email.trim() || password.length < 6 || phone.trim().length < 7) {
      Alert.alert(
        'Регистрация',
        'Укажи почту, телефон и пароль не короче 6 символов.'
      );
      return;
    }

    setBusy(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: 'ladygo://auth/callback',
        data: { phone: phone.trim() },
      },
    });

    setBusy(false);

    if (error) {
      Alert.alert('Ошибка регистрации', error.message);
      return;
    }

    if (data.session) {
      setSession(data.session);
      await loadProfile(data.session.user.id);
      setScreen('home');
      Alert.alert('LadyGo 💗', 'Аккаунт создан!');
    } else {
      Alert.alert(
        'Проверь почту',
        'Открой письмо от Supabase и подтверди регистрацию.'
      );
    }
  }

  // Вход
  async function signIn() {
    if (!email.trim() || password.length < 6) {
      Alert.alert('Вход', 'Проверь почту и пароль.');
      return;
    }

    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (error) {
      Alert.alert('Не удалось войти', error.message);
    }
  }

  // Выход
  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert('Ошибка выхода', error.message);
      return;
    }

    setSession(null);
    setProfile(null);
    setOrders([]);
    setScreen('home');
  }

  // Определение текущего местоположения
  async function useMyLocation() {
    setLocationBusy(true);

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Доступ к геопозиции',
          'Разреши доступ к местоположению или введи адрес вручную.'
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setPickupCoords(coords);

      const places = await Location.reverseGeocodeAsync(coords);

      if (places?.[0]) {
        const place = places[0];

        const address = [
          place.street,
          place.streetNumber,
          place.name,
          place.city,
        ].filter(Boolean).join(', ');

        if (address) setFrom(address);
      }
    } catch (error) {
      Alert.alert(
        'Геопозиция',
        'Не удалось определить местоположение. Введи адрес вручную.'
      );
    } finally {
      setLocationBusy(false);
    }
  }

  // Поиск координат по адресу
  async function getCoordinates(address) {
    try {
      const result = await Location.geocodeAsync(address.trim());

      if (result?.length) {
        return {
          latitude: result[0].latitude,
          longitude: result[0].longitude,
        };
      }
    } catch (error) {
      console.log('Geocoding error:', error);
    }

    return null;
  }

  // Создание настоящей заявки
  async function createOrder() {
    if (!from.trim() || !to.trim()) {
      Alert.alert('Не хватает адресов', 'Заполни оба адреса.');
      return;
    }

    if (!session || !profile) {
      Alert.alert('Профиль', 'Не удалось загрузить профиль.');
      return;
    }

    setBusy(true);

    let start = pickupCoords;
    let finish = destinationCoords;

    if (!start) {
      start = await getCoordinates(from);
    }

    if (!finish) {
      finish = await getCoordinates(to);
    }

    const passengerPhone =
      profile.phone ||
      session.user.user_metadata?.phone ||
      phone ||
      null;

    const { data, error } = await supabase
      .from('orders')
      .insert({
        passenger_id: session.user.id,
        passenger_phone: passengerPhone,
        pickup_address: from.trim(),
        destination_address: to.trim(),
        requested_for: when.trim() || 'Как можно скорее',
        notes: notes.trim() || null,
        status: 'new',
        driver_id: null,
        price_rub: null,
        pickup_lat: start?.latitude ?? null,
        pickup_lng: start?.longitude ?? null,
        destination_lat: finish?.latitude ?? null,
        destination_lng: finish?.longitude ?? null,
      })
      .select()
      .single();

    setBusy(false);

    if (error) {
      Alert.alert(
        'Заказ не отправлен',
        'Supabase не сохранил заявку: ' + error.message
      );
      return;
    }

    setFrom('');
    setTo('');
    setWhen('Как можно скорее');
    setNotes('');
    setPickupCoords(null);
    setDestinationCoords(null);

    setOrders((previous) => [data, ...previous]);
    setScreen('trips');

    Alert.alert(
      'Заявка отправлена! 💗',
      'Заказ сохранён. Водитель сможет увидеть его в своём приложении.'
    );
  }

  // Отмена заявки
  async function cancelOrder(id) {
    Alert.alert(
      'Отменить заявку?',
      'Ты действительно хочешь отменить поездку?',
      [
        { text: 'Нет', style: 'cancel' },
        {
          text: 'Да, отменить',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc(
              'cancel_my_order',
              { order_id: id }
            );

            if (error) {
              Alert.alert(
                'Не удалось отменить',
                error.message
              );
            } else {
              loadOrders();
            }
          },
        },
      ]
    );
  }

  // Обновление заявки водителем
  async function updateOrder(id, patch) {
    setBusy(true);

    const { error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', id);

    setBusy(false);

    if (error) {
      Alert.alert('Не удалось обновить заказ', error.message);
    } else {
      await loadOrders();
    }
  }

  // Принять заявку и подтвердить цену
  async function acceptOrder(order) {
    const value = Number(
      String(fare[order.id] || '').replace(',', '.')
    );

    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Стоимость', 'Укажи корректную цену в рублях.');
      return;
    }

    await updateOrder(order.id, {
      driver_id: session.user.id,
      price_rub: value,
      status: 'accepted',
    });
  }

  // Звонок
  async function callNumber(number) {
    try {
      await Linking.openURL('tel:' + number);
    } catch (error) {
      Alert.alert('Звонок', 'Не удалось открыть приложение телефона.');
    }
  }

  // Почта поддержки
  async function contactSupport() {
    const subject = encodeURIComponent('Обращение в поддержку LadyGo');
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;

    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        'Поддержка',
        `Напиши нам на ${SUPPORT_EMAIL}`
      );
    }
  }

  // Карта поездки
  function OrderMap({ order }) {
    const hasPickup =
      order.pickup_lat != null && order.pickup_lng != null;

    const hasDestination =
      order.destination_lat != null &&
      order.destination_lng != null;

    if (!hasPickup && !hasDestination) return null;

    const first = hasPickup
      ? {
          latitude: Number(order.pickup_lat),
          longitude: Number(order.pickup_lng),
        }
      : {
          latitude: Number(order.destination_lat),
          longitude: Number(order.destination_lng),
        };

    const second = hasDestination
      ? {
          latitude: Number(order.destination_lat),
          longitude: Number(order.destination_lng),
        }
      : null;

    return (
      <MapView
        style={styles.mapSmall}
        initialRegion={{
          latitude: first.latitude,
          longitude: first.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
      >
        {hasPickup && (
          <Marker
            coordinate={first}
            title="Место подачи"
            pinColor={PINK}
          />
        )}

        {hasDestination && (
          <Marker
            coordinate={second}
            title="Место назначения"
            pinColor="#5B8DEF"
          />
        )}

        {hasPickup && hasDestination && (
          <Polyline
            coordinates={[first, second]}
            strokeColor={PINK}
            strokeWidth={3}
          />
        )}
      </MapView>
    );
  }

  // Ошибка конфигурации
  if (!isConfigured) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.logo}>LadyGo</Text>
        <SectionTitle>Нет подключения к серверу</SectionTitle>
        <Text style={styles.body}>
          Проверь EXPO_PUBLIC_SUPABASE_URL и
          EXPO_PUBLIC_SUPABASE_ANON_KEY в настройках Expo.
        </Text>
      </SafeAreaView>
    );
  }

  // Загрузка
  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={PINK} />
        <Text style={styles.body}>Загружаем LadyGo…</Text>
      </SafeAreaView>
    );
  }

  // Авторизация
  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.auth}>
            <Text style={styles.logo}>LadyGo</Text>
            <Text style={styles.subtitle}>Поездки с заботой 💗</Text>

            <SectionTitle>Добро пожаловать</SectionTitle>

            <Field
              label="Электронная почта"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />

            <Field
              label="Телефон"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+7 900 000-00-00"
            />

            <Field
              label="Пароль"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <Button
              title={busy ? 'Подождите…' : 'Войти'}
              onPress={signIn}
              disabled={busy}
            />

            <Button
              title={busy ? 'Подождите…' : 'Создать аккаунт'}
              secondary
              onPress={signUp}
              disabled={busy}
            />

            <Text style={styles.hint}>
              После регистрации подтверди почту по ссылке из письма.
            </Text>

            <Button
              title="Связаться с поддержкой"
              secondary
              onPress={contactSupport}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Профиль не найден
  if (!profile) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.logo}>LadyGo</Text>
        <SectionTitle>Профиль не найден</SectionTitle>
        <Text style={styles.body}>
          Аккаунт авторизован, но запись в profiles отсутствует.
          Нужно проверить создание профиля в Supabase.
        </Text>
        <Button title="Выйти" onPress={signOut} />
      </SafeAreaView>
    );
  }

  // Основное приложение
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.top}>
        <View>
          <Text style={styles.logo}>LadyGo</Text>
          <Text style={styles.subtitleSmall}>
            Поездки с заботой
          </Text>
        </View>

        <View style={styles.roleBadge}>
          <Text style={styles.role}>
            {isDriver ? 'ВОДИТЕЛЬ' : 'ПАССАЖИР'}
          </Text>
        </View>
      </View>

      <View style={styles.nav}>
        {(isDriver
          ? [
              ['home', 'Главная'],
              ['trips', 'Заявки'],
              ['profile', 'Профиль'],
            ]
          : [
              ['home', 'Главная'],
              ['order', 'Заказать'],
              ['trips', 'Поездки'],
              ['profile', 'Профиль'],
            ]
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => {
              setScreen(key);
              if (key === 'trips') loadOrders();
            }}
            style={styles.navItem}
          >
            <Text style={[
              styles.navText,
              screen === key && styles.navActive,
            ]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadOrders}
            tintColor={PINK}
          />
        }
      >
        {/* ГЛАВНАЯ */}
        {screen === 'home' && (
          <>
            <View style={styles.welcome}>
              <Text style={styles.welcomeSmall}>
                ДОБРО ПОЖАЛОВАТЬ
              </Text>
              <Text style={styles.welcomeTitle}>
                {isDriver ? 'Панель водителя' : 'Здравствуйте! 💗'}
              </Text>
              <Text style={styles.body}>
                {isDriver
                  ? 'Здесь отображаются новые заявки пассажиров.'
                  : 'Ваш комфорт — наша забота. Закажите поездку в несколько нажатий.'}
              </Text>
            </View>

            {isDriver ? (
              <>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>
                    {orders.filter((o) => o.status === 'new').length}
                  </Text>
                  <Text style={styles.statLabel}>Новых заявок</Text>
                </View>

                <Button
                  title="Открыть заявки"
                  onPress={() => setScreen('trips')}
                />

                <Button
                  title="Позвонить пассажиру можно из заявки"
                  secondary
                  disabled
                />
              </>
            ) : (
              <>
                <View style={styles.hero}>
                  <Text style={styles.heroEmoji}>🚕</Text>
                  <Text style={styles.heroTitle}>
                    Куда отправимся?
                  </Text>
                  <Text style={styles.heroBody}>
                    Укажите адрес подачи и назначения. Водитель
                    подтвердит стоимость поездки.
                  </Text>
                  <Button
                    title="Заказать такси"
                    onPress={() => setScreen('order')}
                  />
                </View>

                <View style={styles.contactCard}>
                  <Text style={styles.cardTitle}>
                    Нужна помощь?
                  </Text>
                  <Button
                    title="📞 Позвонить водителю"
                    onPress={() => callNumber(PHONE)}
                  />
                  <Button
                    title="✉️ Жалобы и вопросы"
                    secondary
                    onPress={contactSupport}
                  />
                </View>
              </>
            )}

            <Text style={styles.hint}>
              LadyGo находится в стадии тестирования. Перед запуском
              реальных поездок необходимо проверить работу сервиса,
              безопасность и правовые требования.
            </Text>
          </>
        )}

        {/* ЗАКАЗ */}
        {screen === 'order' && !isDriver && (
          <>
            <SectionTitle>Новая поездка</SectionTitle>
            <Text style={styles.body}>
              Заполни адреса, и заявка отправится единственному водителю.
            </Text>

            <Button
              title={
                locationBusy
                  ? 'Определяем местоположение…'
                  : '📍 Определить моё местоположение'
              }
              secondary
              onPress={useMyLocation}
              disabled={locationBusy}
            />

            {pickupCoords && (
              <MapView
                style={styles.map}
                initialRegion={{
                  ...pickupCoords,
                  latitudeDelta: 0.025,
                  longitudeDelta: 0.025,
                }}
              >
                <Marker
                  coordinate={pickupCoords}
                  title="Место подачи"
                  pinColor={PINK}
                />
              </MapView>
            )}

            <Field
              label="Откуда"
              value={from}
              onChangeText={(value) => {
                setFrom(value);
                setPickupCoords(null);
              }}
              placeholder="Адрес подачи"
            />

            <Field
              label="Куда"
              value={to}
              onChangeText={(value) => {
                setTo(value);
                setDestinationCoords(null);
              }}
              placeholder="Адрес назначения"
            />

            <Field
              label="Когда"
              value={when}
              onChangeText={setWhen}
              placeholder="Как можно скорее"
            />

            <Field
              label="Комментарий водителю"
              value={notes}
              onChangeText={setNotes}
              placeholder="Подъезд, ориентир, пожелания"
              multiline
            />

            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                💗 Водитель сначала подтвердит стоимость.
                Оплата через приложение пока не подключена.
              </Text>
            </View>

            <Button
              title={busy ? 'Отправляем заявку…' : 'Отправить заявку'}
              onPress={createOrder}
              disabled={busy}
            />

            <Button
              title="Позвонить и заказать по телефону"
              secondary
              onPress={() => callNumber(PHONE)}
            />
          </>
        )}

        {/* ПОЕЗДКИ / ЗАЯВКИ */}
        {screen === 'trips' && (
          <>
            <SectionTitle>
              {isDriver ? 'Заявки пассажиров' : 'Мои поездки'}
            </SectionTitle>

            <Button
              title="Обновить список"
              secondary
              onPress={loadOrders}
            />

            {busy && (
              <ActivityIndicator color={PINK} style={{ margin: 12 }} />
            )}

            {orders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <Status value={order.status} />

                <Text style={styles.orderText}>
                  📍 Откуда: {order.pickup_address}
                </Text>

                <Text style={styles.orderText}>
                  🏁 Куда: {order.destination_address}
                </Text>

                <Text style={styles.orderText}>
                  🕒 Когда: {order.requested_for}
                </Text>

                {order.price_rub != null && (
                  <Text style={styles.price}>
                    {order.price_rub} ₽
                  </Text>
                )}

                <OrderMap order={order} />

                {order.notes && (
                  <Text style={styles.hint}>
                    Комментарий: {order.notes}
                  </Text>
                )}

                {isDriver && order.passenger_phone && (
                  <Button
                    title="📞 Позвонить пассажиру"
                    secondary
                    onPress={() => callNumber(order.passenger_phone)}
                  />
                )}

                {!isDriver && order.status === 'accepted' && (
                  <Button
                    title="📞 Позвонить водителю"
                    secondary
                    onPress={() => callNumber(PHONE)}
                  />
                )}

                {!isDriver && order.status === 'new' && (
                  <Button
                    title="Отменить заявку"
                    secondary
                    onPress={() => cancelOrder(order.id)}
                  />
                )}

                {isDriver && order.status === 'new' && (
                  <>
                    <Field
                      label="Стоимость поездки, ₽"
                      value={fare[order.id] || ''}
                      onChangeText={(value) =>
                        setFare((previous) => ({
                          ...previous,
                          [order.id]: value,
                        }))
                      }
                      keyboardType="decimal-pad"
                      placeholder="Например, 500"
                    />

                    <Button
                      title="Принять и подтвердить стоимость"
                      onPress={() => acceptOrder(order)}
                      disabled={busy}
                    />

                    <Button
                      title="Отклонить заявку"
                      secondary
                      onPress={() =>
                        updateOrder(order.id, {
                          status: 'declined',
                        })
                      }
                      disabled={busy}
                    />
                  </>
                )}

                {isDriver && order.status === 'accepted' && (
                  <Button
                    title="Завершить поездку"
                    onPress={() =>
                      updateOrder(order.id, {
                        status: 'completed',
                      })
                    }
                    disabled={busy}
                  />
                )}
              </View>
            ))}

            {!refreshing && orders.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🚕</Text>
                <Text style={styles.cardTitle}>
                  Пока поездок нет
                </Text>
                <Text style={styles.body}>
                  {isDriver
                    ? 'Новые заявки пассажиров появятся здесь.'
                    : 'Когда ты отправишь заявку, она появится здесь.'}
                </Text>
              </View>
            )}
          </>
        )}

        {/* ПРОФИЛЬ */}
        {screen === 'profile' && (
          <>
            <SectionTitle>Мой профиль</SectionTitle>

            <View style={styles.profileCard}>
              <Text style={styles.profileLabel}>Электронная почта</Text>
              <Text style={styles.profileValue}>
                {session.user.email}
              </Text>

              <Text style={styles.profileLabel}>Телефон</Text>
              <Text style={styles.profileValue}>
                {profile.phone || 'Не указан'}
              </Text>

              <Text style={styles.profileLabel}>Режим</Text>
              <Text style={styles.profileValue}>
                {isDriver ? 'Водитель' : 'Пассажир'}
              </Text>
            </View>

            <Button
              title="📞 Позвонить водителю"
              secondary
              onPress={() => callNumber(PHONE)}
            />

            <Button
              title="✉️ Поддержка LadyGo"
              secondary
              onPress={contactSupport}
            />

            <Text style={styles.hint}>
              {SUPPORT_EMAIL}
            </Text>

            <Button
              title="Выйти из аккаунта"
              onPress={signOut}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function statusLabel(status) {
  return {
    new: 'Новая заявка',
    accepted: 'Водитель подтвердил стоимость',
    declined: 'Заявка отклонена',
    cancelled: 'Заявка отменена',
    completed: 'Поездка завершена',
  }[status] || status;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  center: {
    flex: 1,
    backgroundColor: PALE,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  auth: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: PALE,
  },
  top: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: PINK,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 14,
    color: '#806C75',
    marginBottom: 30,
  },
  subtitleSmall: {
    fontSize: 11,
    color: '#93858C',
    marginTop: -3,
  },
  roleBadge: {
    backgroundColor: PALE,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  role: {
    fontSize: 10,
    fontWeight: '900',
    color: PINK,
    letterSpacing: 1,
  },
  heading: {
    fontSize: 25,
    fontWeight: '900',
    color: DARK,
    marginBottom: 14,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: '#625A60',
    marginBottom: 15,
  },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 13,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F3E5EA',
    backgroundColor: '#FFFCFD',
  },
  navItem: {
    paddingHorizontal: 3,
  },
  navText: {
    fontSize: 12,
    color: '#8A7D83',
    fontWeight: '700',
  },
  navActive: {
    color: PINK,
    fontWeight: '900',
  },
  content: {
    padding: 19,
    paddingBottom: 45,
  },
  welcome: {
    backgroundColor: PALE,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  welcomeSmall: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: PINK,
    marginBottom: 8,
  },
  welcomeTitle: {
    fontSize: 25,
    fontWeight: '900',
    color: DARK,
    marginBottom: 9,
  },
  hero: {
    backgroundColor: PALE,
    borderRadius: 22,
    padding: 21,
    marginVertical: 10,
  },
  heroEmoji: {
    fontSize: 35,
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: DARK,
    marginBottom: 8,
  },
  heroBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#75666D',
    marginBottom: 12,
  },
  contactCard: {
    borderWidth: 1,
    borderColor: '#F1DCE4',
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },
  statCard: {
    backgroundColor: PALE,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    marginVertical: 12,
  },
  statNumber: {
    color: PINK,
    fontSize: 38,
    fontWeight: '900',
  },
  statLabel: {
    color: DARK,
    fontSize: 14,
    fontWeight: '700',
  },
  fieldWrap: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: DARK,
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderColor: '#EADDE2',
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: DARK,
    backgroundColor: '#FFFCFD',
  },
  multiline: {
    minHeight: 85,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: PINK,
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 7,
  },
  secondary: {
    backgroundColor: '#FCE7EE',
    borderWidth: 1,
    borderColor: '#F6CBD9',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#93858C',
    marginTop: 12,
    marginBottom: 8,
  },
  notice: {
    backgroundColor: '#FFF4E8',
    borderRadius: 13,
    padding: 14,
    marginVertical: 9,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#765B3E',
  },
  map: {
    height: 210,
    borderRadius: 15,
    marginBottom: 15,
  },
  mapSmall: {
    height: 175,
    borderRadius: 13,
    marginTop: 12,
    marginBottom: 10,
  },
  orderCard: {
    borderWidth: 1,
    borderColor: '#F1DCE4',
    borderRadius: 18,
    padding: 15,
    marginVertical: 9,
    backgroundColor: '#FFFCFD',
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: PALE,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 12,
  },
  status: {
    fontWeight: '900',
    fontSize: 12,
    color: PINK,
  },
  orderText: {
    fontSize: 13,
    lineHeight: 20,
    color: DARK,
    marginBottom: 6,
  },
  price: {
    fontSize: 23,
    fontWeight: '900',
    color: PINK,
    marginTop: 8,
  },
  empty: {
    alignItems: 'center',
    backgroundColor: PALE,
    padding: 22,
    borderRadius: 18,
    marginTop: 18,
  },
  emptyEmoji: {
    fontSize: 38,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: DARK,
    marginBottom: 8,
  },
  profileCard: {
    backgroundColor: PALE,
    borderRadius: 18,
    padding: 17,
    marginBottom: 15,
  },
  profileLabel: {
    color: '#93858C',
    fontSize: 12,
    marginTop: 10,
  },
  profileValue: {
    color: DARK,
    fontWeight: '800',
    fontSize: 15,
    marginTop: 4,
  },
});
