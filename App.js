
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

// ======================================================
// НАСТРОЙКИ
// ======================================================

const PINK = '#E85D88';
const DARK = '#29232A';
const PALE = '#FFF3F7';
const WHITE = '#FFFFFF';
const MUTED = '#897C83';
const PHONE = '+79911121227';
const SUPPORT_EMAIL = 'ladygosupport@gmail.com';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ======================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ======================================================

function getErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (
    code === 'user_already_exists' ||
    message.includes('already registered') ||
    message.includes('user already exists') ||
    message.includes('already been registered')
  ) {
    return 'Аккаунт с этой почтой уже существует. Войди в свой аккаунт.';
  }

  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials')
  ) {
    return 'Неправильная почта или пароль. Проверь данные и попробуй ещё раз.';
  }

  if (
    message.includes('email not confirmed') ||
    message.includes('email_not_confirmed')
  ) {
    return 'Сначала подтверди почту. Найди письмо от LadyGo или Supabase.';
  }

  if (
    message.includes('password should be at least') ||
    message.includes('weak password')
  ) {
    return 'Пароль слишком короткий или ненадёжный. Используй не менее 6 символов.';
  }

  if (
    message.includes('rate limit') ||
    message.includes('too many requests')
  ) {
    return 'Слишком много попыток. Подожди немного и попробуй снова.';
  }

  if (
    message.includes('network request failed') ||
    message.includes('fetch failed')
  ) {
    return 'Нет соединения с сервером. Проверь интернет и попробуй снова.';
  }

  if (message.includes('jwt expired')) {
    return 'Сессия закончилась. Войди в аккаунт ещё раз.';
  }

  return error?.message || 'Произошла неизвестная ошибка. Попробуй ещё раз.';
}

function statusLabel(status) {
  const labels = {
    new: 'Новая заявка',
    accepted: 'Стоимость подтверждена',
    declined: 'Заявка отклонена',
    cancelled: 'Заявка отменена',
    completed: 'Поездка завершена',
  };

  return labels[status] || status || 'Неизвестно';
}

function applicationStatusLabel(status) {
  const labels = {
    pending: 'На рассмотрении',
    approved: 'Одобрена',
    rejected: 'Отклонена',
  };

  return labels[status] || 'Неизвестно';
}

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('ru-RU');
}

function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  danger = false,
  loading = false,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        danger && styles.dangerButton,
        (disabled || loading) && styles.disabledButton,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? PINK : WHITE} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            secondary && styles.secondaryButtonText,
          ]}
        >
          {title}
        </Text>
      )}
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
  autoCapitalize = 'none',
  editable = true,
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor="#B1A4AA"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        editable={editable}
        style={[
          styles.input,
          multiline && styles.multiline,
          !editable && styles.inputDisabled,
        ]}
      />
    </View>
  );
}

function SectionTitle({ children }) {
  return <Text style={styles.heading}>{children}</Text>;
}

function Status({ value }) {
  const color =
    value === 'completed'
      ? '#32865B'
      : value === 'declined' || value === 'cancelled'
        ? '#B94C60'
        : PINK;

  return (
    <View style={[styles.statusPill, { borderColor: color }]}>
      <Text style={[styles.statusText, { color }]}>
        {statusLabel(value)}
      </Text>
    </View>
  );
}

function OrderMap({ order }) {
  const hasPickup =
    order.pickup_lat != null &&
    order.pickup_lng != null;

  const hasDestination =
    order.destination_lat != null &&
    order.destination_lng != null;

  if (!hasPickup && !hasDestination) return null;

  const pickup = hasPickup
    ? {
        latitude: Number(order.pickup_lat),
        longitude: Number(order.pickup_lng),
      }
    : null;

  const destination = hasDestination
    ? {
        latitude: Number(order.destination_lat),
        longitude: Number(order.destination_lng),
      }
    : null;

  const center = pickup || destination;

  return (
    <MapView
      style={styles.mapSmall}
      initialRegion={{
        ...center,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }}
    >
      {pickup && (
        <Marker
          coordinate={pickup}
          title="Место подачи"
          pinColor={PINK}
        />
      )}

      {destination && (
        <Marker
          coordinate={destination}
          title="Место назначения"
          pinColor="#5489E8"
        />
      )}

      {pickup && destination && (
        <Polyline
          coordinates={[pickup, destination]}
          strokeColor={PINK}
          strokeWidth={3}
        />
      )}
    </MapView>
  );
}

// ======================================================
// ГЛАВНОЕ ПРИЛОЖЕНИЕ
// ======================================================

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [screen, setScreen] = useState('home');
  const [authMode, setAuthMode] = useState('login');

  // Авторизация
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');

  // Заказ
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [when, setWhen] = useState('Как можно скорее');
  const [notes, setNotes] = useState('');

  const [pickupCoords, setPickupCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);

  // Поездки
  const [orders, setOrders] = useState([]);
  const [fare, setFare] = useState({});

  // Заявки водителей
  const [applications, setApplications] = useState([]);
  const [fullName, setFullName] = useState('');
  const [applicationPhone, setApplicationPhone] = useState('');
  const [experience, setExperience] = useState('');

  const isAdmin = profile?.role === 'admin';
  const isDriver = profile?.role === 'driver';
  const isPassenger = profile?.role === 'passenger';

  const myApplication = applications.length
    ? applications[0]
    : null;

  const pendingApplications = applications.filter(
    (item) => item.status === 'pending'
  );

  // ------------------------------------------------------
  // ПРОФИЛЬ
  // ------------------------------------------------------

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      Alert.alert('Ошибка профиля', getErrorMessage(error));
      setLoading(false);
      return null;
    }

    setProfile(data || null);
    setLoading(false);

    return data;
  }, []);

  // ------------------------------------------------------
  // ЗАГРУЗКА ЗАКАЗОВ
  // ------------------------------------------------------

  const loadOrders = useCallback(async () => {
    if (!session || !profile || !supabase) return;

    if (profile.role === 'admin') {
      setOrders([]);
      return;
    }

    setRefreshing(true);

    try {
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
        Alert.alert('Поездки', getErrorMessage(error));
      } else {
        setOrders(data || []);
      }
    } catch (error) {
      Alert.alert('Поездки', getErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [session, profile]);

  // ------------------------------------------------------
  // ЗАГРУЗКА ЗАЯВОК
  // ------------------------------------------------------

  const loadApplications = useCallback(async () => {
    if (!session || !profile || !supabase) return;

    let query = supabase
      .from('driver_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (profile.role !== 'admin') {
      query = query.eq('user_id', session.user.id);
    }

    const { data, error } = await query;

    if (error) {
      Alert.alert('Заявки', getErrorMessage(error));
      return;
    }

    setApplications(data || []);
  }, [session, profile]);

  // ------------------------------------------------------
  // ВОССТАНОВЛЕНИЕ СЕССИИ
  // ------------------------------------------------------

  useEffect(() => {
    if (!isConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function initialize() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          Alert.alert('Авторизация', getErrorMessage(error));
          setLoading(false);
          return;
        }

        if (data.session) {
          setSession(data.session);
          await loadProfile(data.session.user.id);
        } else {
          setLoading(false);
        }
      } catch (error) {
        if (mounted) {
          Alert.alert('Авторизация', getErrorMessage(error));
          setLoading(false);
        }
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
          event === 'USER_UPDATED' ||
          event === 'TOKEN_REFRESHED'
        ) {
          Promise.resolve().then(() => {
            if (mounted) {
              loadProfile(nextSession.user.id);
            }
          });
        }
      } else {
        setProfile(null);
        setOrders([]);
        setApplications([]);
        setLoading(false);
        setScreen('home');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // ------------------------------------------------------
  // ПОДТВЕРЖДЕНИЕ ПОЧТЫ
  // ------------------------------------------------------

  useEffect(() => {
    if (!isConfigured || !supabase) return;

    async function handleUrl(url) {
      if (!url || !url.startsWith('ladygo://')) return;

      try {
        const parsed = new URL(url);

        const errorDescription =
          parsed.searchParams.get('error_description');

        if (errorDescription) {
          Alert.alert(
            'Подтверждение почты',
            decodeURIComponent(errorDescription.replace(/\+/g, ' '))
          );
          return;
        }

        const code = parsed.searchParams.get('code');

        if (!code) return;

        const { error } =
          await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          Alert.alert(
            'Подтверждение почты',
            getErrorMessage(error)
          );
        } else {
          Alert.alert(
            'Почта подтверждена 💗',
            'Теперь можно пользоваться LadyGo.'
          );
        }
      } catch (error) {
        Alert.alert(
          'Ошибка',
          'Не удалось обработать ссылку подтверждения. Попробуй открыть письмо ещё раз.'
        );
      }
    }

    Linking.getInitialURL().then(handleUrl);

    const subscription = Linking.addEventListener(
      'url',
      ({ url }) => handleUrl(url)
    );

    return () => subscription.remove();
  }, []);

  // ------------------------------------------------------
  // ЗАГРУЗКА ДАННЫХ ПОСЛЕ ВХОДА
  // ------------------------------------------------------

  useEffect(() => {
    if (!session || !profile) return;

    loadOrders();
    loadApplications();
  }, [session, profile, loadOrders, loadApplications]);

  // ------------------------------------------------------
  // ОБНОВЛЕНИЕ ЗАКАЗОВ В РЕАЛЬНОМ ВРЕМЕНИ
  // ------------------------------------------------------

  useEffect(() => {
    if (!session || !profile || !supabase || isAdmin) return;

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
  }, [session, profile, isAdmin, loadOrders]);

  // ------------------------------------------------------
  // ОБНОВЛЕНИЕ ЗАЯВОК В РЕАЛЬНОМ ВРЕМЕНИ
  // ------------------------------------------------------

  useEffect(() => {
    if (!session || !profile || !supabase) return;

    const channel = supabase
      .channel('ladygo-applications-' + session.user.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_applications',
        },
        async () => {
          await loadApplications();

          if (!isAdmin) {
            await loadProfile(session.user.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    session,
    profile,
    isAdmin,
    loadApplications,
    loadProfile,
  ]);

  // ======================================================
  // АВТОРИЗАЦИЯ
  // ======================================================

  // РЕГИСТРАЦИЯ

  async function signUp() {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (!EMAIL_REGEX.test(cleanEmail)) {
      Alert.alert(
        'Проверь почту',
        'Введи корректный адрес электронной почты.'
      );
      return;
    }

    if (cleanPhone.replace(/\D/g, '').length < 7) {
      Alert.alert(
        'Проверь телефон',
        'Введи действующий номер телефона.'
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        'Слишком короткий пароль',
        'Пароль должен содержать не менее 6 символов.'
      );
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: 'ladygo://auth/callback',
          data: {
            phone: cleanPhone,
          },
        },
      });

      const alreadyRegistered =
        error?.code === 'user_already_exists' ||
        (
          error?.message &&
          /already registered|user already exists|already been registered/i.test(
            error.message
          )
        ) ||
        (
          !error &&
          data?.user &&
          Array.isArray(data.user.identities) &&
          data.user.identities.length === 0
        );

      if (alreadyRegistered) {
        Alert.alert(
          'Почта уже зарегистрирована',
          'Аккаунт с этой почтой уже существует. Войди в свой аккаунт.',
          [
            {
              text: 'Отмена',
              style: 'cancel',
            },
            {
              text: 'Перейти ко входу',
              onPress: () => {
                setAuthMode('login');
              },
            },
          ]
        );
        return;
      }

      if (error) {
        Alert.alert(
          'Не удалось зарегистрироваться',
          getErrorMessage(error)
        );
        return;
      }

      if (data.session) {
        setSession(data.session);
        await loadProfile(data.user.id);
        setScreen('home');

        Alert.alert(
          'Добро пожаловать в LadyGo! 💗',
          'Твой аккаунт успешно создан.'
        );
      } else {
        Alert.alert(
          'Проверь почту',
          'Мы отправили письмо для подтверждения регистрации. Открой его и перейди по ссылке.'
        );

        setAuthMode('login');
      }
    } catch (error) {
      Alert.alert(
        'Ошибка регистрации',
        getErrorMessage(error)
      );
    } finally {
      setBusy(false);
    }
  }

  // ВХОД

  async function signIn() {
    const cleanEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(cleanEmail)) {
      Alert.alert(
        'Проверь почту',
        'Введи корректный адрес электронной почты.'
      );
      return;
    }

    if (!password) {
      Alert.alert('Пароль', 'Введи пароль от аккаунта.');
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        Alert.alert(
          'Не удалось войти',
          getErrorMessage(error)
        );
      }
    } catch (error) {
      Alert.alert('Ошибка входа', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // ВОССТАНОВЛЕНИЕ ПАРОЛЯ

  async function resetPassword() {
    const cleanEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(cleanEmail)) {
      Alert.alert(
        'Восстановление пароля',
        'Сначала введи правильную почту в поле электронной почты.'
      );
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        cleanEmail,
        {
          redirectTo: 'ladygo://auth/callback',
        }
      );

      if (error) {
        Alert.alert(
          'Не удалось отправить письмо',
          getErrorMessage(error)
        );
        return;
      }

      Alert.alert(
        'Письмо отправлено',
        'Если для этой почты существует аккаунт, на неё придёт письмо для восстановления пароля.'
      );
    } catch (error) {
      Alert.alert(
        'Восстановление пароля',
        getErrorMessage(error)
      );
    } finally {
      setBusy(false);
    }
  }

  // ВЫХОД

  async function signOut() {
    Alert.alert(
      'Выйти из аккаунта?',
      'Ты действительно хочешь выйти из LadyGo?',
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);

            try {
              const { error } = await supabase.auth.signOut();

              if (error) {
                Alert.alert('Ошибка выхода', getErrorMessage(error));
                return;
              }

              setSession(null);
              setProfile(null);
              setOrders([]);
              setApplications([]);
              setPassword('');
              setScreen('home');
              setAuthMode('login');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  // ======================================================
  // МЕСТОПОЛОЖЕНИЕ
  // ======================================================

  async function useMyLocation() {
    setLocationBusy(true);

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Доступ к геопозиции',
          'Разреши приложению доступ к местоположению или введи адрес вручную.'
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

        if (address) {
          setFrom(address);
        } else {
          Alert.alert(
            'Адрес не найден',
            'Местоположение определено, но адрес не распознан. Введи его вручную.'
          );
        }
      }
    } catch (error) {
      Alert.alert(
        'Не удалось определить адрес',
        'Проверь разрешение на геопозицию и попробуй ещё раз.'
      );
    } finally {
      setLocationBusy(false);
    }
  }

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

  // ======================================================
  // ЗАКАЗЫ
  // ======================================================

  async function createOrder() {
    if (!from.trim() || !to.trim()) {
      Alert.alert(
        'Не хватает адресов',
        'Заполни адрес подачи и адрес назначения.'
      );
      return;
    }

    if (from.trim().toLowerCase() === to.trim().toLowerCase()) {
      Alert.alert(
        'Проверь адреса',
        'Адрес подачи и адрес назначения не должны совпадать.'
      );
      return;
    }

    if (!session || !profile || !isPassenger) {
      Alert.alert(
        'Заказ недоступен',
        'Создавать заказы может только пассажир.'
      );
      return;
    }

    setBusy(true);

    try {
      let start = pickupCoords;
      let finish = destinationCoords;

      if (!start) start = await getCoordinates(from);
      if (!finish) finish = await getCoordinates(to);

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

      if (error) {
        Alert.alert(
          'Заказ не отправлен',
          getErrorMessage(error)
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
        'Заказ сохранён. Когда водитель рассмотрит его, статус обновится в разделе «Поездки».'
      );
    } catch (error) {
      Alert.alert('Ошибка заказа', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(id) {
    Alert.alert(
      'Отменить заявку?',
      'Ты действительно хочешь отменить эту поездку?',
      [
        {
          text: 'Не отменять',
          style: 'cancel',
        },
        {
          text: 'Да, отменить',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);

            try {
              const { error } = await supabase.rpc(
                'cancel_my_order',
                { order_id: id }
              );

              if (error) {
                Alert.alert(
                  'Не удалось отменить',
                  getErrorMessage(error)
                );
              } else {
                await loadOrders();

                Alert.alert(
                  'Заявка отменена',
                  'Твоя заявка успешно отменена.'
                );
              }
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  // ======================================================
  // ДЕЙСТВИЯ ВОДИТЕЛЯ
  // ======================================================

  async function updateOrder(id, patch) {
    if (!isDriver) {
      Alert.alert(
        'Доступ запрещён',
        'Эта функция доступна только водителю.'
      );
      return;
    }

    setBusy(true);

    try {
      let query = supabase
        .from('orders')
        .update(patch)
        .eq('id', id);

      if (patch.status === 'declined') {
        query = query
          .eq('status', 'new')
          .is('driver_id', null);
      }

      if (patch.status === 'completed') {
        query = query
          .eq('status', 'accepted')
          .eq('driver_id', session.user.id);
      }

      const { data, error } = await query
        .select('id')
        .maybeSingle();

      if (error) {
        Alert.alert(
          'Не удалось обновить заказ',
          getErrorMessage(error)
        );
        return;
      }

      if (!data) {
        Alert.alert(
          'Заявка уже изменена',
          'Возможно, другой водитель уже принял заказ. Обнови список.'
        );

        await loadOrders();
        return;
      }

      await loadOrders();

      if (patch.status === 'completed') {
        Alert.alert(
          'Поездка завершена',
          'Статус заказа успешно обновлён.'
        );
      }
    } catch (error) {
      Alert.alert('Ошибка', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function acceptOrder(order) {
    if (!isDriver || busy) return;

    const value = Number(
      String(fare[order.id] || '').replace(',', '.')
    );

    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert(
        'Проверь стоимость',
        'Введи корректную стоимость поездки в рублях.'
      );
      return;
    }

    if (value > 1000000) {
      Alert.alert(
        'Слишком большая сумма',
        'Проверь указанную стоимость.'
      );
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase
        .from('orders')
        .update({
          driver_id: session.user.id,
          price_rub: value,
          status: 'accepted',
        })
        .eq('id', order.id)
        .eq('status', 'new')
        .is('driver_id', null)
        .select('id')
        .maybeSingle();

      if (error) {
        Alert.alert(
          'Не удалось принять заказ',
          getErrorMessage(error)
        );
        return;
      }

      if (!data) {
        Alert.alert(
          'Заказ уже занят',
          'Другой водитель мог принять эту заявку раньше. Обнови список.'
        );

        await loadOrders();
        return;
      }

      setFare((previous) => ({
        ...previous,
        [order.id]: '',
      }));

      await loadOrders();

      Alert.alert(
        'Заказ принят! 💗',
        `Стоимость поездки: ${value} ₽`
      );
    } catch (error) {
      Alert.alert('Ошибка', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // ======================================================
  // ЗАЯВКИ ВОДИТЕЛЕЙ
  // ======================================================

  async function submitDriverApplication() {
    if (!isPassenger) {
      Alert.alert(
        'Заявка недоступна',
        'Подать заявку может только пассажир.'
      );
      return;
    }

    if (!fullName.trim() || fullName.trim().length < 2) {
      Alert.alert(
        'Имя',
        'Укажи имя и фамилию.'
      );
      return;
    }

    const contactPhone =
      applicationPhone.trim() ||
      profile.phone ||
      session.user.user_metadata?.phone ||
      '';

    if (contactPhone.replace(/\D/g, '').length < 7) {
      Alert.alert(
        'Телефон',
        'Укажи действующий номер телефона.'
      );
      return;
    }

    if (myApplication?.status === 'pending') {
      Alert.alert(
        'Заявка уже отправлена',
        'Дождись решения администратора.'
      );
      return;
    }

    if (myApplication?.status === 'approved') {
      Alert.alert(
        'Заявка одобрена',
        'Твой аккаунт уже получил роль водителя.'
      );
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase
        .from('driver_applications')
        .insert({
          user_id: session.user.id,
          full_name: fullName.trim(),
          phone: contactPhone,
          experience: experience.trim() || null,
          license_info: 'Готов предоставить документы при личной проверке',
          status: 'pending',
        });

      if (error) {
        Alert.alert(
          'Не удалось отправить заявку',
          getErrorMessage(error)
        );
        return;
      }

      setFullName('');
      setExperience('');
      setApplicationPhone('');

      await loadApplications();
      setScreen('profile');

      Alert.alert(
        'Заявка отправлена! 💗',
        'Администратор рассмотрит её. Статус можно посмотреть в профиле.'
      );
    } catch (error) {
      Alert.alert('Ошибка заявки', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function reviewApplication(application, newStatus) {
    if (!isAdmin || busy) {
      Alert.alert(
        'Доступ запрещён',
        'Только администратор может проверять заявки.'
      );
      return;
    }

    const actionText =
      newStatus === 'approved' ? 'одобрить' : 'отклонить';

    Alert.alert(
      'Проверка заявки',
      `Ты действительно хочешь ${actionText} заявку ${application.full_name}?`,
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: newStatus === 'approved' ? 'Одобрить' : 'Отклонить',
          style: newStatus === 'approved' ? 'default' : 'destructive',
          onPress: async () => {
            setBusy(true);

            try {
              const { data, error } = await supabase
                .from('driver_applications')
                .update({ status: newStatus })
                .eq('id', application.id)
                .eq('status', 'pending')
                .select()
                .maybeSingle();

              if (error) {
                Alert.alert('Ошибка', getErrorMessage(error));
                return;
              }

              if (!data) {
                Alert.alert(
                  'Заявка уже обработана',
                  'Обнови список заявок.'
                );

                await loadApplications();
                return;
              }

              await loadApplications();

              Alert.alert(
                'Готово',
                newStatus === 'approved'
                  ? 'Заявка одобрена. Пользователь получил роль водителя.'
                  : 'Заявка отклонена. Пользователь останется пассажиром.'
              );
            } catch (error) {
              Alert.alert('Ошибка', getErrorMessage(error));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  // ======================================================
  // СВЯЗЬ И ПОДДЕРЖКА
  // ======================================================

  async function callNumber(number) {
    if (!number) {
      Alert.alert('Телефон', 'Номер телефона не указан.');
      return;
    }

    try {
      await Linking.openURL('tel:' + number);
    } catch (error) {
      Alert.alert(
        'Не удалось открыть звонок',
        'Попробуй открыть приложение телефона вручную.'
      );
    }
  }

  async function contactSupport() {
    const subject = encodeURIComponent(
      'Обращение в поддержку LadyGo'
    );

    const url =
      `mailto:${SUPPORT_EMAIL}?subject=${subject}`;

    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        'Поддержка LadyGo',
        `Напиши нам на ${SUPPORT_EMAIL}`
      );
    }
  }

  // ======================================================
  // ОБНОВЛЕНИЕ ДАННЫХ
  // ======================================================

  async function refreshAll() {
    if (!session || !profile) return;

    if (isAdmin) {
      await loadApplications();
    } else {
      await Promise.all([
        loadOrders(),
        loadApplications(),
      ]);
    }
  }

  // ======================================================
  // ЭКРАН: НЕТ ПОДКЛЮЧЕНИЯ
  // ======================================================

  if (!isConfigured || !supabase) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="dark" />

        <Text style={styles.logo}>LadyGo</Text>

        <Text style={styles.heading}>
          Нет подключения к серверу
        </Text>

        <Text style={styles.bodyCenter}>
          Проверь настройки Expo:
          {'\n\n'}
          EXPO_PUBLIC_SUPABASE_URL
          {'\n'}
          EXPO_PUBLIC_SUPABASE_ANON_KEY
        </Text>
      </SafeAreaView>
    );
  }

  // ======================================================
  // ЭКРАН: ЗАГРУЗКА
  // ======================================================

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="dark" />

        <Text style={styles.logo}>LadyGo</Text>

        <ActivityIndicator
          size="large"
          color={PINK}
          style={{ marginTop: 15 }}
        />

        <Text style={styles.body}>
          Загружаем твой аккаунт…
        </Text>
      </SafeAreaView>
    );
  }

  // ======================================================
  // ЭКРАН: АВТОРИЗАЦИЯ
  // ======================================================

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.auth}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.authHeader}>
              <Text style={styles.logo}>LadyGo</Text>

              <Text style={styles.subtitle}>
                Поездки с заботой 💗
              </Text>

              <Text style={styles.authDescription}>
                Удобный сервис для организации поездок.
              </Text>
            </View>

            <View style={styles.authCard}>
              <View style={styles.authTabs}>
                <TouchableOpacity
                  style={[
                    styles.authTab,
                    authMode === 'login' && styles.authTabActive,
                  ]}
                  onPress={() => setAuthMode('login')}
                >
                  <Text
                    style={[
                      styles.authTabText,
                      authMode === 'login' && styles.authTabTextActive,
                    ]}
                  >
                    Вход
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.authTab,
                    authMode === 'signup' && styles.authTabActive,
                  ]}
                  onPress={() => setAuthMode('signup')}
                >
                  <Text
                    style={[
                      styles.authTabText,
                      authMode === 'signup' && styles.authTabTextActive,
                    ]}
                  >
                    Регистрация
                  </Text>
                </TouchableOpacity>
              </View>

              <SectionTitle>
                {authMode === 'login'
                  ? 'С возвращением!'
                  : 'Создать аккаунт'}
              </SectionTitle>

              <Text style={styles.body}>
                {authMode === 'login'
                  ? 'Введи данные своего аккаунта LadyGo.'
                  : 'Заполни данные, чтобы зарегистрироваться.'}
              </Text>

              <Field
                label="Электронная почта"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                placeholder="example@mail.com"
              />

              {authMode === 'signup' && (
                <Field
                  label="Номер телефона"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="+7 900 000-00-00"
                />
              )}

              <Field
                label="Пароль"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Не менее 6 символов"
              />

              {authMode === 'login' && (
                <TouchableOpacity
                  style={styles.forgotButton}
                  onPress={resetPassword}
                  disabled={busy}
                >
                  <Text style={styles.forgotText}>
                    Забыли пароль?
                  </Text>
                </TouchableOpacity>
              )}

              <Button
                title={
                  authMode === 'login'
                    ? 'Войти в аккаунт'
                    : 'Создать аккаунт'
                }
                onPress={
                  authMode === 'login'
                    ? signIn
                    : signUp
                }
                loading={busy}
                disabled={busy}
              />

              <Text style={styles.hintCenter}>
                {authMode === 'signup'
                  ? 'После регистрации может потребоваться подтверждение почты.'
                  : 'Если у тебя ещё нет аккаунта, выбери «Регистрация».'}
              </Text>

              <View style={styles.authDivider} />

              <Button
                title="Связаться с поддержкой"
                secondary
                onPress={contactSupport}
                disabled={busy}
              />
            </View>

            <Text style={styles.footer}>
              Создано независимым автором @acyma
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ======================================================
  // ЭКРАН: ПРОФИЛЬ НЕ НАЙДЕН
  // ======================================================

  if (!profile) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="dark" />

        <Text style={styles.logo}>LadyGo</Text>

        <SectionTitle>Профиль не найден</SectionTitle>

        <Text style={styles.bodyCenter}>
          Аккаунт авторизован, но запись профиля не найдена.
          Проверь создание профиля в Supabase.
        </Text>

        <Button
          title="Повторить загрузку"
          onPress={() => loadProfile(session.user.id)}
        />

        <Button
          title="Выйти"
          secondary
          onPress={signOut}
        />
      </SafeAreaView>
    );
  }

  // ======================================================
  // НАВИГАЦИЯ
  // ======================================================

  const navigation = isAdmin
    ? [
        ['home', 'Главная'],
        ['applications', 'Заявки'],
        ['profile', 'Профиль'],
      ]
    : isDriver
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
        ];

  const allowedScreens = navigation.map((item) => item[0]);

  if (!allowedScreens.includes(screen) &&
      !(screen === 'apply' && isPassenger)) {
    // Не показываем экран, недоступный текущей роли.
    setScreen('home');
  }

  // ======================================================
  // ОСНОВНОЙ ИНТЕРФЕЙС
  // ======================================================

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* ШАПКА */}

      <View style={styles.top}>
        <View>
          <Text style={styles.logo}>LadyGo</Text>

          <Text style={styles.subtitleSmall}>
            Поездки с заботой
          </Text>
        </View>

        <View style={styles.roleBadge}>
          <Text style={styles.role}>
            {isAdmin
              ? 'АДМИНИСТРАТОР'
              : isDriver
                ? 'ВОДИТЕЛЬ'
                : 'ПАССАЖИР'}
          </Text>
        </View>
      </View>

      {/* НАВИГАЦИЯ */}

      <View style={styles.nav}>
        {navigation.map(([key, label]) => (
          <TouchableOpacity
            key={key}
            activeOpacity={0.7}
            onPress={() => {
              setScreen(key);

              if (key === 'trips') loadOrders();
              if (key === 'applications') loadApplications();
              if (key === 'profile') loadApplications();
            }}
            style={[
              styles.navItem,
              screen === key && styles.navItemActive,
            ]}
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

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={PINK}
          />
        }
      >

        {/* ============================================== */}
        {/* ГЛАВНАЯ */}
        {/* ============================================== */}

        {screen === 'home' && (
          <>
            <View style={styles.welcome}>
              <Text style={styles.welcomeSmall}>
                ДОБРО ПОЖАЛОВАТЬ В LADYGO
              </Text>

              <Text style={styles.welcomeTitle}>
                {isAdmin
                  ? 'Панель администратора'
                  : isDriver
                    ? 'Панель водителя'
                    : 'Здравствуйте! 💗'}
              </Text>

              <Text style={styles.body}>
                {isAdmin
                  ? 'Управляй заявками пользователей и проверяй желающих стать водителями.'
                  : isDriver
                    ? 'Здесь ты можешь просматривать доступные заявки пассажиров.'
                    : 'Ваш комфорт — наша забота. Закажите поездку в несколько нажатий.'}
              </Text>
            </View>

            {/* АДМИНИСТРАТОР */}

            {isAdmin && (
              <>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>
                    {pendingApplications.length}
                  </Text>

                  <Text style={styles.statLabel}>
                    Заявок ожидают проверки
                  </Text>
                </View>

                <Button
                  title="Проверить заявки водителей"
                  onPress={() => {
                    setScreen('applications');
                    loadApplications();
                  }}
                />

                <Button
                  title="Обновить данные"
                  secondary
                  onPress={loadApplications}
                />
              </>
            )}

            {/* ВОДИТЕЛЬ */}

            {isDriver && (
              <>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>
                    {orders.filter((item) => item.status === 'new').length}
                  </Text>

                  <Text style={styles.statLabel}>
                    Доступных заявок
                  </Text>
                </View>

                <Button
                  title="Открыть заявки"
                  onPress={() => {
                    setScreen('trips');
                    loadOrders();
                  }}
                />

                <Button
                  title="Обновить заявки"
                  secondary
                  onPress={loadOrders}
                />
              </>
            )}

            {/* ПАССАЖИР */}

            {isPassenger && (
              <>
                <View style={styles.hero}>
                  <Text style={styles.heroEmoji}>🚕</Text>

                  <Text style={styles.heroTitle}>
                    Куда отправимся?
                  </Text>

                  <Text style={styles.heroBody}>
                    Укажи адрес подачи и назначения.
                    Водитель подтвердит стоимость поездки.
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
                    title="📞 Позвонить"
                    onPress={() => callNumber(PHONE)}
                  />

                  <Button
                    title="✉️ Написать в поддержку"
                    secondary
                    onPress={contactSupport}
                  />
                </View>

                <View style={styles.contactCard}>
                  <Text style={styles.cardTitle}>
                    Хочешь стать водителем?
                  </Text>

                  <Text style={styles.body}>
                    Отправь заявку. Администратор рассмотрит её.
                  </Text>

                  <Button
                    title="Подать заявку"
                    secondary
                    onPress={() => setScreen('apply')}
                  />
                </View>
              </>
            )}

            <Text style={styles.footer}>
              Создано независимым автором @acyma
            </Text>
          </>
        )}

        {/* ============================================== */}
        {/* ЗАКАЗ */}
        {/* ============================================== */}

        {screen === 'order' && isPassenger && (
          <>
            <SectionTitle>Новая поездка</SectionTitle>

            <Text style={styles.body}>
              Заполни адреса, и заявка отправится водителям.
            </Text>

            <Button
              title={
                locationBusy
                  ? 'Определяем местоположение…'
                  : '📍 Определить моё местоположение'
              }
              secondary
              onPress={useMyLocation}
              disabled={locationBusy || busy}
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
              title="Отправить заявку"
              onPress={createOrder}
              loading={busy}
              disabled={busy}
            />

            <Button
              title="Позвонить и заказать по телефону"
              secondary
              onPress={() => callNumber(PHONE)}
              disabled={busy}
            />
          </>
        )}

        {/* ============================================== */}
        {/* ЗАЯВКА ВОДИТЕЛЯ */}
        {/* ============================================== */}

        {screen === 'apply' && isPassenger && (
          <>
            <SectionTitle>Стать водителем</SectionTitle>

            {myApplication?.status === 'pending' ? (
              <View style={styles.applicationCard}>
                <Text style={styles.cardTitle}>
                  Заявка отправлена
                </Text>

                <View style={styles.applicationStatus}>
                  <Text style={styles.applicationStatusText}>
                    {applicationStatusLabel(myApplication.status)}
                  </Text>
                </View>

                <Text style={styles.body}>
                  Администратор ещё не принял решение.
                  Статус можно обновить ниже.
                </Text>

                <Button
                  title="Обновить статус"
                  secondary
                  onPress={loadApplications}
                />
              </View>
            ) : myApplication?.status === 'approved' ? (
              <View style={styles.applicationCard}>
                <Text style={styles.cardTitle}>
                  Заявка одобрена! 💗
                </Text>

                <Text style={styles.body}>
                  Твой аккаунт получил роль водителя.
                  Обнови профиль, если интерфейс ещё не изменился.
                </Text>

                <Button
                  title="Обновить профиль"
                  onPress={() => loadProfile(session.user.id)}
                />
              </View>
            ) : (
              <>
                {myApplication?.status === 'rejected' && (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>
                      Предыдущая заявка была отклонена.
                      Ты можешь отправить новую.
                    </Text>
                  </View>
                )}

                <Text style={styles.body}>
                  Заполни данные для связи. Не отправляй сюда номера
                  водительских удостоверений или фотографии документов.
                  Их проверку нужно проводить отдельно и безопасно.
                </Text>

                <Field
                  label="Имя и фамилия"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Как к тебе обращаться"
                  autoCapitalize="words"
                />

                <Field
                  label="Контактный телефон"
                  value={applicationPhone}
                  onChangeText={setApplicationPhone}
                  keyboardType="phone-pad"
                  placeholder="+7 900 000-00-00"
                />

                <Field
                  label="Опыт вождения"
                  value={experience}
                  onChangeText={setExperience}
                  placeholder="Например, несколько лет"
                  multiline
                />

                <View style={styles.notice}>
                  <Text style={styles.noticeText}>
                    Документы и право на управление автомобилем должны
                    проверяться отдельно до допуска к реальным поездкам.
                  </Text>
                </View>

                <Button
                  title="Отправить заявку"
                  onPress={submitDriverApplication}
                  loading={busy}
                  disabled={busy}
                />
              </>
            )}
          </>
        )}

        {/* ============================================== */}
        {/* ЗАЯВКИ АДМИНИСТРАТОРА */}
        {/* ============================================== */}

        {screen === 'applications' && isAdmin && (
          <>
            <SectionTitle>Заявки водителей</SectionTitle>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {pendingApplications.length}
              </Text>

              <Text style={styles.statLabel}>
                Ожидают проверки
              </Text>
            </View>

            <Button
              title="Обновить список"
              secondary
              onPress={loadApplications}
            />

            {applications.map((application) => (
              <View
                key={application.id}
                style={styles.applicationCard}
              >
                <View style={styles.applicationHeader}>
                  <Text style={styles.cardTitle}>
                    {application.full_name}
                  </Text>

                  <View style={styles.applicationStatus}>
                    <Text style={styles.applicationStatusText}>
                      {applicationStatusLabel(application.status)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.orderText}>
                  📞 {application.phone}
                </Text>

                {!!application.experience && (
                  <Text style={styles.orderText}>
                    Опыт: {application.experience}
                  </Text>
                )}

                <Text style={styles.hint}>
                  Отправлена: {formatDate(application.created_at)}
                </Text>

                {!!application.admin_note && (
                  <Text style={styles.orderText}>
                    Примечание: {application.admin_note}
                  </Text>
                )}

                {application.status === 'pending' && (
                  <>
                    <Button
                      title="Одобрить заявку"
                      onPress={() =>
                        reviewApplication(application, 'approved')
                      }
                      disabled={busy}
                    />

                    <Button
                      title="Отклонить заявку"
                      secondary
                      onPress={() =>
                        reviewApplication(application, 'rejected')
                      }
                      disabled={busy}
                    />
                  </>
                )}
              </View>
            ))}

            {applications.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📋</Text>

                <Text style={styles.cardTitle}>
                  Заявок пока нет
                </Text>

                <Text style={styles.body}>
                  Когда пользователь отправит заявку,
                  она появится здесь.
                </Text>
              </View>
            )}
          </>
        )}

        {/* ============================================== */}
        {/* ПОЕЗДКИ */}
        {/* ============================================== */}

        {screen === 'trips' && !isAdmin && (
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
              <ActivityIndicator
                color={PINK}
                style={{ margin: 12 }}
              />
            )}

            {orders.map((order) => (
              <View
                key={order.id}
                style={styles.orderCard}
              >
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

                <Text style={styles.hint}>
                  Создано: {formatDate(order.created_at)}
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
                    disabled={busy}
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

                {isDriver &&
                  order.status === 'accepted' &&
                  order.driver_id === session.user.id && (
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

        {/* ============================================== */}
        {/* ПРОФИЛЬ */}
        {/* ============================================== */}

        {screen === 'profile' && (
          <>
            <SectionTitle>Мой профиль</SectionTitle>

            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {isAdmin ? 'A' : isDriver ? 'В' : 'П'}
                </Text>
              </View>

              <Text style={styles.profileLabel}>
                Электронная почта
              </Text>

              <Text style={styles.profileValue}>
                {session.user.email}
              </Text>

              <Text style={styles.profileLabel}>
                Телефон
              </Text>

              <Text style={styles.profileValue}>
                {profile.phone || 'Не указан'}
              </Text>

              <Text style={styles.profileLabel}>
                Режим
              </Text>

              <Text style={styles.profileValue}>
                {isAdmin
                  ? 'Администратор'
                  : isDriver
                    ? 'Водитель'
                    : 'Пассажир'}
              </Text>
            </View>

            {isPassenger && (
              <View style={styles.applicationCard}>
                <Text style={styles.cardTitle}>
                  Заявка водителя
                </Text>

                {myApplication ? (
                  <>
                    <View style={styles.applicationStatus}>
                      <Text style={styles.applicationStatusText}>
                        {applicationStatusLabel(myApplication.status)}
                      </Text>
                    </View>

                    <Text style={styles.body}>
                      {myApplication.status === 'pending'
                        ? 'Администратор ещё рассматривает твою заявку.'
                        : myApplication.status === 'rejected'
                          ? 'Заявка отклонена. Можно отправить новую.'
                          : 'Заявка одобрена.'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.body}>
                    Ты ещё не отправлял заявку на роль водителя.
                  </Text>
                )}

                {myApplication?.status !== 'pending' && (
                  <Button
                    title={
                      myApplication?.status === 'rejected'
                        ? 'Отправить новую заявку'
                        : 'Стать водителем'
                    }
                    secondary
                    onPress={() => setScreen('apply')}
                  />
                )}
              </View>
            )}

            <View style={styles.contactCard}>
              <Text style={styles.cardTitle}>
                Поддержка LadyGo
              </Text>

              <Text style={styles.hint}>
                {SUPPORT_EMAIL}
              </Text>

              <Button
                title="✉️ Написать в поддержку"
                secondary
                onPress={contactSupport}
              />

              <Button
                title="📞 Позвонить"
                secondary
                onPress={() => callNumber(PHONE)}
              />
            </View>

            <Button
              title="Выйти из аккаунта"
              danger
              onPress={signOut}
            />

            <Text style={styles.footer}>
              Создано независимым автором @acyma
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ======================================================
// СТИЛИ
// ======================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WHITE,
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
    padding: 20,
    paddingBottom: 35,
    backgroundColor: PALE,
  },

  authHeader: {
    alignItems: 'center',
    marginBottom: 25,
  },

  authDescription: {
    fontSize: 13,
    color: MUTED,
    marginTop: 9,
    textAlign: 'center',
  },

  authCard: {
    backgroundColor: WHITE,
    borderRadius: 24,
    padding: 19,
    borderWidth: 1,
    borderColor: '#F4E0E7',
    shadowColor: '#B56B84',
    shadowOpacity: 0.08,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },

  authTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF3F7',
    borderRadius: 13,
    padding: 4,
    marginBottom: 22,
  },

  authTab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
  },

  authTabActive: {
    backgroundColor: WHITE,
    elevation: 2,
  },

  authTabText: {
    color: MUTED,
    fontWeight: '800',
    fontSize: 13,
  },

  authTabTextActive: {
    color: PINK,
  },

  forgotButton: {
    alignSelf: 'flex-end',
    paddingVertical: 5,
    marginTop: -7,
    marginBottom: 8,
  },

  forgotText: {
    color: PINK,
    fontSize: 13,
    fontWeight: '800',
  },

  authDivider: {
    height: 1,
    backgroundColor: '#F2E5EA',
    marginVertical: 13,
  },

  hintCenter: {
    fontSize: 12,
    lineHeight: 18,
    color: '#93858C',
    textAlign: 'center',
    marginTop: 13,
  },

  top: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  logo: {
    fontSize: 33,
    fontWeight: '900',
    color: PINK,
    letterSpacing: -1.2,
  },

  subtitle: {
    fontSize: 14,
    color: MUTED,
    marginTop: 4,
  },

  subtitleSmall: {
    fontSize: 11,
    color: MUTED,
    marginTop: -3,
  },

  roleBadge: {
    backgroundColor: PALE,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
  },

  role: {
    fontSize: 10,
    fontWeight: '900',
    color: PINK,
    letterSpacing: 0.7,
  },

  heading: {
    fontSize: 24,
    fontWeight: '900',
    color: DARK,
    marginBottom: 13,
  },

  body: {
    fontSize: 14,
    lineHeight: 22,
    color: '#6E6269',
    marginBottom: 14,
  },

  bodyCenter: {
    fontSize: 14,
    lineHeight: 22,
    color: '#6E6269',
    textAlign: 'center',
    marginVertical: 14,
  },

  nav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 11,
    paddingHorizontal: 5,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F3E5EA',
    backgroundColor: '#FFFCFD',
  },

  navItem: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 12,
  },

  navItemActive: {
    backgroundColor: PALE,
  },

  navText: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '700',
  },

  navActive: {
    color: PINK,
    fontWeight: '900',
  },

  content: {
    padding: 18,
    paddingBottom: 45,
  },

  welcome: {
    backgroundColor: PALE,
    borderRadius: 22,
    padding: 21,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F7E1E9',
  },

  welcomeSmall: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
    color: PINK,
    marginBottom: 9,
  },

  welcomeTitle: {
    fontSize: 25,
    fontWeight: '900',
    color: DARK,
    marginBottom: 9,
  },

  hero: {
    backgroundColor: PALE,
    borderRadius: 23,
    padding: 21,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#F7E1E9',
  },

  heroEmoji: {
    fontSize: 39,
    marginBottom: 11,
  },

  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: DARK,
    marginBottom: 8,
  },

  heroBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#75666D',
    marginBottom: 12,
  },

  contactCard: {
    borderWidth: 1,
    borderColor: '#F1DCE4',
    borderRadius: 19,
    padding: 16,
    marginTop: 13,
    backgroundColor: WHITE,
  },

  statCard: {
    backgroundColor: PALE,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#F7E1E9',
  },

  statNumber: {
    color: PINK,
    fontSize: 40,
    fontWeight: '900',
  },

  statLabel: {
    color: DARK,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 3,
  },

  fieldWrap: {
    marginBottom: 15,
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
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: DARK,
    backgroundColor: '#FFFCFD',
  },

  inputDisabled: {
    backgroundColor: '#F5F1F3',
    opacity: 0.7,
  },

  multiline: {
    minHeight: 85,
    textAlignVertical: 'top',
  },

  button: {
    backgroundColor: PINK,
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 7,
    minHeight: 49,
  },

  secondaryButton: {
    backgroundColor: '#FCE8EF',
    borderWidth: 1,
    borderColor: '#F5CCD9',
  },

  dangerButton: {
    backgroundColor: '#B94C60',
  },

  disabledButton: {
    opacity: 0.45,
  },

  buttonText: {
    color: WHITE,
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
  },

  secondaryButtonText: {
    color: PINK,
  },

  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#93858C',
    marginTop: 10,
    marginBottom: 8,
  },

  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: '#A18F97',
    marginTop: 23,
    marginBottom: 10,
  },

  notice: {
    backgroundColor: '#FFF4E8',
    borderRadius: 14,
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
    borderRadius: 16,
    marginBottom: 15,
  },

  mapSmall: {
    height: 175,
    borderRadius: 14,
    marginTop: 12,
    marginBottom: 10,
  },

  orderCard: {
    borderWidth: 1,
    borderColor: '#F1DCE4',
    borderRadius: 20,
    padding: 16,
    marginVertical: 9,
    backgroundColor: WHITE,
  },

  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: PALE,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 13,
  },

  statusText: {
    fontWeight: '900',
    fontSize: 12,
  },

  orderText: {
    fontSize: 13,
    lineHeight: 21,
    color: DARK,
    marginBottom: 7,
  },

  price: {
    fontSize: 24,
    fontWeight: '900',
    color: PINK,
    marginTop: 8,
  },

  empty: {
    alignItems: 'center',
    backgroundColor: PALE,
    padding: 24,
    borderRadius: 20,
    marginTop: 18,
  },

  emptyEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: DARK,
    marginBottom: 9,
  },

  profileCard: {
    backgroundColor: PALE,
    borderRadius: 20,
    padding: 19,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#F7E1E9',
  },

  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },

  avatarText: {
    color: WHITE,
    fontSize: 24,
    fontWeight: '900',
  },

  profileLabel: {
    color: MUTED,
    fontSize: 12,
    marginTop: 11,
  },

  profileValue: {
    color: DARK,
    fontWeight: '800',
    fontSize: 15,
    marginTop: 4,
  },

  applicationCard: {
    borderWidth: 1,
    borderColor: '#F1DCE4',
    borderRadius: 19,
    padding: 16,
    marginVertical: 9,
    backgroundColor: WHITE,
  },

  applicationHeader: {
    marginBottom: 8,
  },

  applicationStatus: {
    alignSelf: 'flex-start',
    backgroundColor: PALE,
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginBottom: 10,
  },

  applicationStatusText: {
    color: PINK,
    fontWeight: '900',
    fontSize: 12,
  },
});
