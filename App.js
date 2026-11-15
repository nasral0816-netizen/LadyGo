import React, { useEffect, useState } from 'react';
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
} from 'react-native';

import { StatusBar } from 'expo-status-bar';
import { supabase, isConfigured } from './src/supabase';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';

const PINK = '#E85D88';
const PALE = '#FFF4F7';
const DARK = '#28232A';

function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && { color: PINK },
        ]}
      >
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
        autoCapitalize="none"
        style={styles.input}
      />
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('home');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [when, setWhen] = useState('Как можно скорее');
  const [notes, setNotes] = useState('');

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [fare, setFare] = useState({});

  const [pickupCoords, setPickupCoords] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);

  // Загрузка профиля пользователя
  async function loadProfile(userId) {
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
  }

  // Обработка ссылки подтверждения почты
  async function handleAuthUrl(url) {
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

      if (!code) {
        Alert.alert(
          'Подтверждение',
          'В ссылке не найден код подтверждения. Попробуй открыть письмо ещё раз.'
        );
        return;
      }

      const { error } =
        await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        Alert.alert('Ошибка подтверждения', error.message);
        return;
      }

      setScreen('home');

      Alert.alert(
        'Почта подтверждена! 💗',
        'Добро пожаловать в LadyGo! Аккаунт подтверждён, вход выполнен автоматически.'
      );
    } catch (error) {
      Alert.alert(
        'Ошибка',
        'Не удалось обработать ссылку. Попробуй открыть её ещё раз.'
      );
    }
  }

  // Проверка сессии и отслеживание авторизации
  useEffect(() => {
    if (!isConfigured) {
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
        if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          Promise.resolve().then(() =>
            loadProfile(nextSession.user.id)
          );
        }
      } else {
        setProfile(null);
        setOrders([]);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Получение ссылки при открытии приложения
  useEffect(() => {
    if (!isConfigured) return;

    Linking.getInitialURL().then((url) => {
      if (url) handleAuthUrl(url);
    });

    const subscription = Linking.addEventListener(
      'url',
      ({ url }) => {
        handleAuthUrl(url);
      }
    );

    return () => subscription.remove();
  }, []);

  // Загрузка поездок
  async function loadOrders() {
    if (!session || !profile) return;

    setBusy(true);

    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (profile.role !== 'driver') {
      query = query.eq('passenger_id', session.user.id);
    }

    const { data, error } = await query;

    if (error) {
      Alert.alert('Поездки', error.message);
    } else {
      setOrders(data || []);
    }

    setBusy(false);
  }

  useEffect(() => {
    if (session && profile) {
      loadOrders();
    }
  }, [session, profile]);

  // Обновление поездок в реальном времени
  useEffect(() => {
    if (!session || !profile) return;

    const channel = supabase
      .channel('ladygo-orders-' + session.user.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, profile]);

  // Вход
  async function signIn() {
    if (!email.trim() || password.length < 6) {
      Alert.alert(
        'Вход',
        'Укажи электронную почту и пароль не короче 6 символов.'
      );
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
    } else {
      setScreen('home');
      Alert.alert('Добро пожаловать!', 'Вход выполнен успешно. 💗');
    }
  }

  // Регистрация с подтверждением почты
  async function signUp() {
    if (
      !email.trim() ||
      password.length < 6 ||
      phone.trim().length < 7
    ) {
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
        data: {
          phone: phone.trim(),
        },
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

      Alert.alert(
        'Добро пожаловать в LadyGo! 💗',
        'Аккаунт создан. Вы уже вошли в приложение.'
      );
    } else {
      Alert.alert(
        'Проверь почту 📩',
        'Мы отправили письмо для подтверждения регистрации. Нажми на ссылку в письме. После подтверждения приложение откроется и выполнит вход автоматически.'
      );
    }
  }

  // Определение местоположения
  async function useMyLocation() {
    setLocationBusy(true);

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Нужен доступ к геопозиции',
          'Разреши LadyGo доступ к местоположению или введи адрес вручную.'
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

      if (places && places[0]) {
        const address = places[0];

        const addressText = [
          address.street,
          address.streetNumber,
          address.name,
          address.city,
        ]
          .filter(Boolean)
          .join(', ');

        if (addressText) setFrom(addressText);
      }

      Alert.alert(
        'Местоположение получено',
        'Проверь адрес подачи перед отправкой заявки.'
      );
    } catch (error) {
      Alert.alert(
        'Геопозиция',
        'Не удалось определить местоположение. Введи адрес вручную.'
      );
    } finally {
      setLocationBusy(false);
    }
  }

  // Создание заявки
  async function createOrder() {
    if (!from.trim() || !to.trim()) {
      Alert.alert(
        'Не хватает адресов',
        'Заполни адрес подачи и назначения.'
      );
      return;
    }

    if (!session) return;

    setBusy(true);

    const { error } = await supabase.from('orders').insert({
      passenger_id: session.user.id,
      passenger_phone:
        profile?.phone ||
        session.user.user_metadata?.phone ||
        null,
      pickup_address: from.trim(),
      destination_address: to.trim(),
      requested_for: when,
      notes: notes.trim() || null,
      status: 'new',
      pickup_lat: pickupCoords?.latitude ?? null,
      pickup_lng: pickupCoords?.longitude ?? null,
    });

    setBusy(false);

    if (error) {
      Alert.alert('Заказ не отправлен', error.message);
      return;
    }

    setFrom('');
    setTo('');
    setNotes('');
    setPickupCoords(null);
    setScreen('trips');

    await loadOrders();

    Alert.alert(
      'Заявка отправлена! 💗',
      'Водитель увидит заявку и подтвердит стоимость.'
    );
  }

  // Отмена заявки
  async function cancelOrder(id) {
    const { error } = await supabase.rpc(
      'cancel_my_order',
      { order_id: id }
    );

    if (error) {
      Alert.alert('Не удалось отменить', error.message);
    } else {
      loadOrders();
    }
  }

  // Изменение заявки водителем
  async function updateOrder(id, patch) {
    const { error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', id);

    if (error) {
      Alert.alert('Не удалось обновить', error.message);
    } else {
      loadOrders();
    }
  }

  // Принятие заявки и подтверждение стоимости
  async function acceptOrder(order) {
    const value = Number(
      String(fare[order.id] || '').replace(',', '.')
    );

    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert(
        'Стоимость',
        'Введи корректную стоимость в рублях.'
      );
      return;
    }

    await updateOrder(order.id, {
      driver_id: session.user.id,
      price_rub: value,
      status: 'accepted',
    });
  }

  // Выход
  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert('Ошибка выхода', error.message);
      return;
    }

    setScreen('home');
    setProfile(null);
    setOrders([]);
  }

  // Экран ошибки подключения
  if (!isConfigured) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.logo}>LadyGo</Text>
        <Text style={styles.heading}>
          Нужно подключить сервер
        </Text>
        <Text style={styles.body}>
          Проверь переменные EXPO_PUBLIC_SUPABASE_URL и
          EXPO_PUBLIC_SUPABASE_ANON_KEY в настройках сборки Expo.
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

  // Экран авторизации
  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />

        <ScrollView contentContainerStyle={styles.auth}>
          <Text style={styles.logo}>LadyGo</Text>
          <Text style={styles.subtitle}>Поездки с заботой</Text>

          <Text style={styles.heading}>
            Добро пожаловать
          </Text>

          <Field
            label="Электронная почта"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />

          <Field
            label="Телефон для связи"
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
            title={
              busy
                ? 'Подождите…'
                : 'Создать аккаунт'
            }
            secondary
            onPress={signUp}
            disabled={busy}
          />

          <Text style={styles.hint}>
            После регистрации подтверди почту по ссылке из письма.
            Затем LadyGo автоматически выполнит вход.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Основной экран приложения
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.top}>
        <Text style={styles.logo}>LadyGo</Text>

        <Text style={styles.role}>
          {profile?.role === 'driver'
            ? 'РЕЖИМ ВОДИТЕЛЯ'
            : 'ПАССАЖИР'}
        </Text>
      </View>

      <View style={styles.nav}>
        {[
          ['home', 'Главная'],
          ['order', 'Заказать'],
          ['trips', 'Поездки'],
          ['profile', 'Профиль'],
        ].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => {
              setScreen(key);
              if (key === 'trips') loadOrders();
            }}
          >
            <Text
              style={[
                styles.navText,
                screen === key && styles.navActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {screen === 'home' && (
          <>
            <Text style={styles.heading}>
              Здравствуйте! 💗
            </Text>

            <Text style={styles.body}>
              LadyGo — частные поездки с подтверждением
              стоимости водителем.
            </Text>

            <View style={styles.hero}>
              <Text style={styles.heroTitle}>
                Ваша поездка начинается здесь
              </Text>

              <Text style={styles.heroBody}>
                Укажите адреса, отправьте заявку и дождитесь
                подтверждения водителя.
              </Text>

              <Button
                title="Заказать поездку"
                onPress={() => setScreen('order')}
              />
            </View>

            <Text style={styles.hint}>
              Сервис находится в тестовой разработке.
              Не используйте его для реальных поездок,
              пока не проверены безопасность, законность
              и работа всех процессов.
            </Text>
          </>
        )}

        {screen === 'order' && (
          <>
            <Text style={styles.heading}>Новая поездка</Text>

            <Button
              title={
                locationBusy
                  ? 'Определяем…'
                  : '📍 Указать моё местоположение'
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
                  latitudeDelta: 0.012,
                  longitudeDelta: 0.012,
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
              onChangeText={setFrom}
              placeholder="Адрес подачи"
            />

            <Field
              label="Куда"
              value={to}
              onChangeText={setTo}
              placeholder="Адрес назначения"
            />

            <Field
              label="Когда"
              value={when}
              onChangeText={setWhen}
              placeholder="Например, сегодня в 18:30"
            />

            <Field
              label="Комментарий водителю"
              value={notes}
              onChangeText={setNotes}
              placeholder="Подъезд, ориентир…"
            />

            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Стоимость не списывается автоматически:
                водитель сначала подтверждает цену.
                Оплата в приложении пока не реализована.
              </Text>
            </View>

            <Button
              title={
                busy ? 'Отправляем…' : 'Отправить заявку'
              }
              onPress={createOrder}
              disabled={busy}
            />
          </>
        )}

        {screen === 'trips' && (
          <>
            <Text style={styles.heading}>
              {profile?.role === 'driver'
                ? 'Заявки'
                : 'Мои поездки'}
            </Text>

            <Button
              title="Обновить"
              secondary
              onPress={loadOrders}
            />

            {busy && <ActivityIndicator color={PINK} />}

            {orders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <Text style={styles.status}>
                  {statusLabel(order.status)}
                </Text>

                <Text style={styles.orderText}>
                  Откуда: {order.pickup_address}
                </Text>

                <Text style={styles.orderText}>
                  Куда: {order.destination_address}
                </Text>

                <Text style={styles.orderText}>
                  Когда: {order.requested_for}
                </Text>

                {order.price_rub != null && (
                  <Text style={styles.price}>
                    {order.price_rub} ₽
                  </Text>
                )}

                {order.pickup_lat != null &&
                  order.pickup_lng != null && (
                    <MapView
                      style={styles.mapSmall}
                      initialRegion={{
                        latitude: Number(order.pickup_lat),
                        longitude: Number(order.pickup_lng),
                        latitudeDelta: 0.012,
                        longitudeDelta: 0.012,
                      }}
                    >
                      <Marker
                        coordinate={{
                          latitude: Number(order.pickup_lat),
                          longitude: Number(order.pickup_lng),
                        }}
                        title="Подача"
                        pinColor={PINK}
                      />
                    </MapView>
                  )}

                {profile?.role === 'driver' &&
                  order.passenger_phone && (
                    <Button
                      title="Позвонить пассажиру"
                      secondary
                      onPress={() =>
                        Linking.openURL(
                          'tel:' + order.passenger_phone
                        )
                      }
                    />
                  )}

                {profile?.role !== 'driver' &&
                  order.status === 'new' && (
                    <Button
                      title="Отменить заявку"
                      secondary
                      onPress={() => cancelOrder(order.id)}
                    />
                  )}

                {order.notes && (
                  <Text style={styles.hint}>
                    Комментарий: {order.notes}
                  </Text>
                )}

                {profile?.role === 'driver' &&
                  order.status === 'new' && (
                    <>
                      <Field
                        label="Стоимость, ₽"
                        value={fare[order.id] || ''}
                        onChangeText={(value) =>
                          setFare((previous) => ({
                            ...previous,
                            [order.id]: value,
                          }))
                        }
                        keyboardType="decimal-pad"
                      />

                      <Button
                        title="Принять и подтвердить цену"
                        onPress={() => acceptOrder(order)}
                      />

                      <Button
                        title="Отклонить"
                        secondary
                        onPress={() =>
                          updateOrder(order.id, {
                            status: 'declined',
                          })
                        }
                      />
                    </>
                  )}

                {profile?.role === 'driver' &&
                  order.status === 'accepted' && (
                    <Button
                      title="Поездка завершена"
                      onPress={() =>
                        updateOrder(order.id, {
                          status: 'completed',
                        })
                      }
                    />
                  )}
              </View>
            ))}

            {!busy && orders.length === 0 && (
              <Text style={styles.body}>
                Пока поездок нет.
              </Text>
            )}
          </>
        )}

        {screen === 'profile' && (
          <>
            <Text style={styles.heading}>Профиль</Text>

            <Text style={styles.body}>
              {session.user.email}
            </Text>

            <Text style={styles.body}>
              Режим:{' '}
              {profile?.role === 'driver'
                ? 'Водитель'
                : 'Пассажир'}
            </Text>

            <Text style={styles.body}>
              Телефон: {profile?.phone || 'не указан'}
            </Text>

            <Text style={styles.hint}>
              Номер телефона в этой версии не подтверждается
              SMS.
            </Text>

            <Button
              title="Выйти"
              onPress={signOut}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function statusLabel(status) {
  return (
    {
      new: 'Новая заявка',
      accepted: 'Водитель подтвердил стоимость',
      declined: 'Отклонена',
      cancelled: 'Отменена',
      completed: 'Завершена',
    }[status] || status
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  role: {
    fontSize: 10,
    fontWeight: '800',
    color: PINK,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#806C75',
    marginBottom: 34,
  },
  heading: {
    fontSize: 25,
    fontWeight: '800',
    color: DARK,
    marginBottom: 14,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    color: '#625A60',
    marginBottom: 16,
  },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F3E5EA',
  },
  navText: {
    fontSize: 13,
    color: '#8A7D83',
    fontWeight: '600',
  },
  navActive: {
    color: PINK,
    fontWeight: '900',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  fieldWrap: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
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
  button: {
    backgroundColor: PINK,
    borderRadius: 13,
    padding: 15,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  secondary: {
    backgroundColor: '#FCE7EE',
    borderWidth: 1,
    borderColor: '#F6CBD9',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  hero: {
    backgroundColor: PALE,
    borderRadius: 20,
    padding: 20,
    marginVertical: 14,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: DARK,
    marginBottom: 8,
  },
  heroBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#75666D',
    marginBottom: 12,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#93858C',
    marginTop: 12,
  },
  notice: {
    backgroundColor: '#FFF4E8',
    borderRadius: 12,
    padding: 13,
    marginVertical: 8,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#765B3E',
  },
  map: {
    height: 190,
    borderRadius: 14,
    marginBottom: 14,
  },
  mapSmall: {
    height: 150,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 8,
  },
  orderCard: {
    borderWidth: 1,
    borderColor: '#F1DCE4',
    borderRadius: 16,
    padding: 15,
    marginVertical: 8,
  },
  status: {
    fontWeight: '900',
    color: PINK,
    marginBottom: 9,
  },
  orderText: {
    fontSize: 14,
    color: DARK,
    marginBottom: 5,
  },
  price: {
    fontSize: 21,
    fontWeight: '900',
    color: PINK,
    marginTop: 8,
  },
});
