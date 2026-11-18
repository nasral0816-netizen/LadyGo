import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase, isConfigured } from './supabase';

const C = {
  pink: '#E85D91', pinkDark: '#C94378', pale: '#FFF3F7',
  ink: '#282329', muted: '#8E8289', line: '#F0E5E9',
  white: '#FFFFFF', green: '#26865A', red: '#C34F63',
  blue: '#477FD1', map: '#F6F1ED',
};
const PHONE = '+79911121227';
const SUPPORT = 'ladygosupport@gmail.com';
const TARIFFS = [
  { id: 'economy', name: 'Эконом', detail: 'Для повседневных поездок', factor: 1 },
  { id: 'comfort', name: 'Комфорт', detail: 'Больше пространства', factor: 1.35 },
  { id: 'child', name: 'С детьми', detail: 'Поездка с ребёнком', factor: 1.2 },
];
const ACTIVE = ['new', 'accepted', 'arrived', 'in_progress'];
const STATUS = {
  new: 'Ищем водителя', accepted: 'Водитель назначен', arrived: 'Водитель на месте',
  in_progress: 'Поездка началась', completed: 'Поездка завершена',
  cancelled: 'Заказ отменён', declined: 'Заказ отклонён',
};
const money = value => value == null ? 'Стоимость согласует водитель' : `${value} ₽`;
const errorText = error => {
  const m = String(error?.message || '');
  if (/invalid login credentials/i.test(m)) return 'Неверная почта или пароль.';
  if (/email not confirmed/i.test(m)) return 'Сначала подтверди электронную почту.';
  if (/network request failed|fetch failed/i.test(m)) return 'Проверь подключение к интернету.';
  return m || 'Не удалось выполнить действие. Попробуй ещё раз.';
};

function Button({ title, onPress, secondary, danger, disabled, compact }) {
  return <TouchableOpacity activeOpacity={0.82} disabled={disabled} onPress={onPress}
    style={[s.button, secondary && s.buttonSecondary, danger && s.buttonDanger,
      disabled && { opacity: 0.45 }, compact && { paddingVertical: 10 }]}>
    <Text style={[s.buttonText, secondary && { color: C.pinkDark }, danger && { color: C.red }]}>{title}</Text>
  </TouchableOpacity>;
}
function Input({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, multiline }) {
  return <View style={s.field}>
    {label ? <Text style={s.label}>{label}</Text> : null}
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder || label}
      placeholderTextColor="#B6AAB0" keyboardType={keyboardType} secureTextEntry={secureTextEntry}
      multiline={multiline} autoCapitalize="none" style={[s.input, multiline && { minHeight: 76, textAlignVertical: 'top' }]} />
  </View>;
}
function Pill({ children, color = C.pink }) {
  return <View style={[s.pill, { borderColor: color }]}><Text style={{ color, fontWeight: '700', fontSize: 12 }}>{children}</Text></View>;
}
function Card({ children, style }) { return <View style={[s.card, style]}>{children}</View>; }

export default function LadyGoApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('passenger');
  const [tab, setTab] = useState('ride');
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [tariff, setTariff] = useState('economy');
  const [coords, setCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [route, setRoute] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [orders, setOrders] = useState([]);
  const [applications, setApplications] = useState([]);
  const [driverOnline, setDriverOnline] = useState(false);
  const [fare, setFare] = useState({});
  const [applicationName, setApplicationName] = useState('');
  const [applicationPhone, setApplicationPhone] = useState('');
  const [applicationCar, setApplicationCar] = useState('');
  const [applicationNote, setApplicationNote] = useState('');

  const user = session?.user;
  const role = profile?.role || 'passenger';
  const isAdmin = role === 'admin';
  const isDriver = role === 'driver';
  const activeOrder = useMemo(() => orders.find(o => ACTIVE.includes(o.status)), [orders]);

  const loadProfile = useCallback(async currentUser => {
    if (!currentUser || !supabase) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (error) throw error;
    if (data) { setProfile(data); return data; }
    const { data: created, error: createError } = await supabase.from('profiles')
      .insert({ id: currentUser.id, email: currentUser.email, role: 'passenger' }).select('*').single();
    if (createError) throw createError;
    setProfile(created);
    return created;
  }, []);

  const loadOrders = useCallback(async () => {
    if (!user || !profile || !supabase) return;
    let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(40);
    if (role === 'driver') query = query.or('driver_id.eq.' + user.id + ',and(status.eq.new,driver_id.is.null)');
    else if (!isAdmin) query = query.eq('passenger_id', user.id);
    const { data, error } = await query;
    if (error) throw error;
    setOrders(data || []);
  }, [user, profile, role, isAdmin]);

  const loadApplications = useCallback(async () => {
    if (!isAdmin || !supabase) return;
    const { data, error } = await supabase.from('driver_applications').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    setApplications(data || []);
  }, [isAdmin]);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([loadOrders(), loadApplications()]);
    } catch (e) { Alert.alert('Не удалось обновить данные', errorText(e)); }
  }, [loadOrders, loadApplications]);

  useEffect(() => {
    let mounted = true;
    if (!supabase) { setBooting(false); return; }
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user);
      setBooting(false);
    }).catch(e => { if (mounted) { setBooting(false); Alert.alert('Ошибка запуска', errorText(e)); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) { setProfile(null); setOrders([]); }
      else loadProfile(nextSession.user).catch(e => Alert.alert('Профиль', errorText(e)));
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadProfile]);

  useEffect(() => { if (user && profile) refreshAll(); }, [user, profile, refreshAll]);
  useEffect(() => { if (isDriver) setMode('driver'); else if (isAdmin) setMode('admin'); else setMode('passenger'); }, [isDriver, isAdmin]);
  useEffect(() => {
    if (!user || !supabase) return;
    const channel = supabase.channel('ladygo-orders-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders().catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadOrders]);

  const signIn = async () => {
    if (!email.trim() || !password) return Alert.alert('Заполни поля', 'Укажи почту и пароль.');
    setBusy(true);
    const result = authMode === 'signup'
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) return Alert.alert('Авторизация', errorText(result.error));
    if (authMode === 'signup' && !result.data.session) Alert.alert('Проверь почту', 'Отправили письмо для подтверждения аккаунта.');
  };

  const getCurrentLocation = async () => {
    setLocationBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Разреши доступ к местоположению в настройках телефона.');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setCoords(point);
      const addresses = await Location.reverseGeocodeAsync(point);
      const a = addresses?.[0];
      setPickup([a?.street, a?.streetNumber, a?.district, a?.city].filter(Boolean).join(', ') || 'Моё местоположение');
    } catch (e) { Alert.alert('Геолокация', errorText(e)); }
    setLocationBusy(false);
  };

  const buildRoute = async () => {
    if (!pickup.trim() || !destination.trim()) return;
    try {
      const a = coords || (await Location.geocodeAsync(pickup))[0];
      const b = destinationCoords || (await Location.geocodeAsync(destination))[0];
      if (!a || !b) return;
      const start = { latitude: a.latitude, longitude: a.longitude };
      const end = { latitude: b.latitude, longitude: b.longitude };
      setCoords(start); setDestinationCoords(end);
      const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const json = await response.json();
      const r = json.routes?.[0];
      if (r) {
        setRoute(r.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })));
        setRouteInfo({ km: (r.distance / 1000).toFixed(1), minutes: Math.max(1, Math.round(r.duration / 60)) });
      } else { setRoute([start, end]); setRouteInfo(null); }
    } catch (_) { setRoute(coords && destinationCoords ? [coords, destinationCoords] : []); setRouteInfo(null); }
  };

  const createOrder = async () => {
    if (!pickup.trim() || !destination.trim()) return Alert.alert('Маршрут не заполнен', 'Укажи адрес подачи и назначения.');
    if (activeOrder) return Alert.alert('У тебя уже есть активный заказ', 'Заверши или отмени текущую поездку перед новым заказом.');
    setBusy(true);
    try {
      let start = coords, end = destinationCoords;
      if (!start) { const x = (await Location.geocodeAsync(pickup))[0]; if (x) start = { latitude: x.latitude, longitude: x.longitude }; }
      if (!end) { const x = (await Location.geocodeAsync(destination))[0]; if (x) end = { latitude: x.latitude, longitude: x.longitude }; }
      const selected = TARIFFS.find(t => t.id === tariff);
      const payload = {
        passenger_id: user.id, pickup_address: pickup.trim(), destination_address: destination.trim(),
        requested_for: 'Как можно скорее', passenger_phone: phone.trim() || null,
        notes: [comment.trim(), 'Тариф: ' + (selected?.name || 'Эконом'), routeInfo ? `Маршрут: ${routeInfo.km} км, около ${routeInfo.minutes} мин` : ''].filter(Boolean).join(' | '),
        status: 'new',
        ...(start ? { pickup_lat: start.latitude, pickup_lng: start.longitude } : {}),
        ...(end ? { destination_lat: end.latitude, destination_lng: end.longitude } : {}),
      };
      const { error } = await supabase.from('orders').insert(payload);
      if (error) throw error;
      Alert.alert('Заказ отправлен', 'Ищем свободного водителя. Стоимость подтвердит водитель.');
      setTab('trips');
      await loadOrders();
    } catch (e) { Alert.alert('Не удалось заказать поездку', errorText(e)); }
    setBusy(false);
  };

  const updateOrder = async (order, status, extra = {}) => {
    setBusy(true);
    let query = supabase.from('orders').update({ status, ...extra }).eq('id', order.id).eq('status', order.status);
    if (isDriver) query = query.eq('driver_id', user.id);
    const { data, error } = await query.select('id').maybeSingle();
    setBusy(false);
    if (error) return Alert.alert('Ошибка заказа', errorText(error));
    if (!data) return Alert.alert('Статус уже изменился', 'Обнови список заказов.');
    await loadOrders();
  };

  const cancelOrder = order => Alert.alert('Отменить заказ?', 'Водитель больше не будет выполнять эту поездку.', [
    { text: 'Не отменять', style: 'cancel' },
    { text: 'Отменить', style: 'destructive', onPress: async () => {
      const { error } = await supabase.rpc('cancel_my_order', { order_id: order.id });
      if (error) Alert.alert('Не удалось отменить', errorText(error));
      else await loadOrders();
    } },
  ]);

  const submitApplication = async () => {
    if (!applicationName.trim() || !applicationPhone.trim()) return Alert.alert('Заполни данные', 'Нужны имя и телефон для связи.');
    setBusy(true);
    const { error } = await supabase.from('driver_applications').insert({
      user_id: user.id, full_name: applicationName.trim(), phone: applicationPhone.trim(),
      experience: [applicationCar.trim() ? 'Автомобиль: ' + applicationCar.trim() : '', applicationNote.trim()].filter(Boolean).join(' | '),
      license_info: 'Готов предоставить документы для проверки', status: 'pending',
    });
    setBusy(false);
    if (error) return Alert.alert('Заявка', errorText(error));
    Alert.alert('Заявка отправлена', 'Администратор рассмотрит её.');
    loadApplications();
  };

  const reviewApplication = async (app, approved) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('driver_applications')
        .update({ status: approved ? 'approved' : 'rejected' }).eq('id', app.id);
      if (error) throw error;
      await loadApplications();
    } catch (e) { Alert.alert('Не удалось обработать заявку', errorText(e)); }
    setBusy(false);
  };

  const logout = async () => { await supabase.auth.signOut(); };

  if (booting) return <View style={s.center}><ActivityIndicator color={C.pink} size="large" /><Text style={s.muted}>Загружаем LadyGo…</Text></View>;
  if (!isConfigured) return <View style={s.center}><Text style={s.brand}>LadyGo</Text><Text style={s.heading}>Нужно подключить сервер</Text><Text style={s.muted}>Добавь EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY в переменные окружения Expo.</Text></View>;
  if (!session) return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content" backgroundColor={C.pale} /><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.auth}>
    <Text style={s.brand}>LadyGo</Text><Text style={s.tagline}>Поездки с заботой</Text>
    <Card><Text style={s.title}>{authMode === 'login' ? 'С возвращением' : 'Создать аккаунт'}</Text>
      <Input label="Электронная почта" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Input label="Пароль" value={password} onChangeText={setPassword} secureTextEntry />
      <Button title={busy ? 'Подождите…' : authMode === 'login' ? 'Войти' : 'Зарегистрироваться'} onPress={signIn} disabled={busy} />
      <Button title={authMode === 'login' ? 'Создать аккаунт' : 'У меня уже есть аккаунт'} secondary onPress={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} />
    </Card><Text style={s.muted}>LadyGo • Комфортные поездки</Text>
  </KeyboardAvoidingView></SafeAreaView>;

  const mapRegion = coords ? { ...coords, latitudeDelta: 0.045, longitudeDelta: 0.045 } : {
    latitude: 43.905, longitude: 42.716, latitudeDelta: 0.12, longitudeDelta: 0.12,
  };

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white} />
    <View style={s.topbar}>
      <View><Text style={s.brandSmall}>LadyGo</Text><Text style={s.topSub}>Поездки с заботой</Text></View>
      <TouchableOpacity style={s.avatar} onPress={() => setTab('profile')}><Text style={s.avatarText}>{(profile?.email || 'L')[0].toUpperCase()}</Text></TouchableOpacity>
    </View>
    <View style={s.rolebar}>
      <TouchableOpacity onPress={() => { setMode('passenger'); setTab('ride'); }} style={[s.roleButton, mode === 'passenger' && s.roleActive]}><Text style={[s.roleText, mode === 'passenger' && s.roleTextActive]}>Пассажир</Text></TouchableOpacity>
      {isDriver && <TouchableOpacity onPress={() => { setMode('driver'); setTab('ride'); }} style={[s.roleButton, mode === 'driver' && s.roleActive]}><Text style={[s.roleText, mode === 'driver' && s.roleTextActive]}>Водитель</Text></TouchableOpacity>}
      {isAdmin && <TouchableOpacity onPress={() => { setMode('admin'); setTab('ride'); }} style={[s.roleButton, mode === 'admin' && s.roleActive]}><Text style={[s.roleText, mode === 'admin' && s.roleTextActive]}>Администратор</Text></TouchableOpacity>}
    </View>

    {mode === 'passenger' && tab === 'ride' && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.mapWrap}><MapView style={s.map} region={mapRegion} onRegionChangeComplete={r => { if (!coords) return; }} showsUserLocation>
        {coords && <Marker coordinate={coords} title="Подача" pinColor={C.pink} />}
        {destinationCoords && <Marker coordinate={destinationCoords} title="Назначение" pinColor={C.blue} />}
        {route.length > 1 && <Polyline coordinates={route} strokeColor={C.pink} strokeWidth={5} />}
      </MapView><TouchableOpacity style={s.locButton} onPress={getCurrentLocation}><Text style={s.locText}>{locationBusy ? 'Определяем…' : '◎ Моё местоположение'}</Text></TouchableOpacity></View>
      <Card>
        <Text style={s.title}>Куда едем?</Text>
        <Input label="Откуда" value={pickup} onChangeText={v => { setPickup(v); setCoords(null); }} placeholder="Адрес подачи" />
        <Button title="Определить моё местоположение" secondary compact onPress={getCurrentLocation} />
        <Input label="Куда" value={destination} onChangeText={v => { setDestination(v); setDestinationCoords(null); }} placeholder="Адрес назначения" />
        <Button title="Построить маршрут" secondary compact onPress={buildRoute} />
        {routeInfo && <Text style={s.routeInfo}>{routeInfo.km} км · около {routeInfo.minutes} мин в пути</Text>}
      </Card>
      <Text style={s.section}>Выберите тариф</Text>
      {TARIFFS.map(t => <TouchableOpacity key={t.id} onPress={() => setTariff(t.id)} style={[s.tariff, tariff === t.id && s.tariffSelected]}>
        <View style={s.tariffIcon}><Text style={s.tariffEmoji}>{t.id === 'child' ? '♡' : t.id === 'comfort' ? '✦' : '↗'}</Text></View>
        <View style={{ flex: 1 }}><Text style={s.tariffName}>{t.name}</Text><Text style={s.muted}>{t.detail}</Text></View>
        <View style={[s.radio, tariff === t.id && s.radioOn]} />
      </TouchableOpacity>)}
      <Card><Text style={s.section}>Пожелания к поездке</Text>
        <Input label="Телефон для связи (необязательно)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+7…" />
        <Input label="Комментарий водителю" value={comment} onChangeText={setComment} multiline placeholder="Например, подъехать к главному входу" />
        <Button title={busy ? 'Отправляем…' : 'Заказать поездку'} onPress={createOrder} disabled={busy} />
        <Text style={s.disclaimer}>Стоимость поездки подтвердит водитель до начала поездки. Оплата — по договорённости.</Text>
      </Card>
    </ScrollView>}

    {mode === 'passenger' && tab === 'trips' && <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Мои поездки</Text>
      {orders.length === 0 && <Card><Text style={s.muted}>Здесь появятся твои заказы.</Text></Card>}
      {orders.map(o => <Card key={o.id}>
        <View style={s.rowBetween}><Pill color={o.status === 'completed' ? C.green : o.status === 'cancelled' ? C.red : C.pink}>{STATUS[o.status] || o.status}</Pill><Text style={s.price}>{money(o.price_rub)}</Text></View>
        <Text style={s.address}>● {o.pickup_address}</Text><Text style={s.address}>● {o.destination_address}</Text>
        {o.driver_id && <Text style={s.muted}>Водитель назначен</Text>}
        {ACTIVE.includes(o.status) && <Button title="Отменить заказ" danger secondary onPress={() => cancelOrder(o)} />}
      </Card>)}
    </ScrollView>}

    {mode === 'driver' && <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Рабочий экран</Text>
      <Card><Text style={s.muted}>Статус водителя</Text><Text style={s.heading}>{driverOnline ? 'На линии' : 'Не на линии'}</Text>
        <Button title={driverOnline ? 'Завершить смену' : 'Выйти на линию'} onPress={() => setDriverOnline(v => !v)} secondary={!driverOnline} />
        <Text style={s.disclaimer}>Переключатель пока управляет только интерфейсом. Перед реальной работой подключим серверное присутствие водителя и распределение предложений.</Text>
      </Card>
      <Text style={s.section}>Доступные заказы</Text>
      {orders.filter(o => o.status === 'new' && !o.driver_id).map(o => <Card key={o.id}>
        <Pill>Новый заказ</Pill><Text style={s.address}>Забрать: {o.pickup_address}</Text><Text style={s.address}>Доставить: {o.destination_address}</Text>
        <Input label="Предложить стоимость, ₽" value={String(fare[o.id] || '')} onChangeText={v => setFare(p => ({ ...p, [o.id]: v }))} keyboardType="numeric" placeholder="Например, 450" />
        <Button title="Принять заказ" disabled={busy} onPress={async () => {
          const value = Number(String(fare[o.id] || '').replace(',', '.'));
          if (!Number.isFinite(value) || value <= 0) return Alert.alert('Стоимость', 'Укажи корректную стоимость поездки.');
          setBusy(true);
          const { data, error } = await supabase.from('orders').update({ driver_id: user.id, price_rub: value, status: 'accepted' }).eq('id', o.id).eq('status', 'new').is('driver_id', null).select('id').maybeSingle();
          setBusy(false);
          if (error) Alert.alert('Не удалось принять заказ', errorText(error));
          else if (!data) Alert.alert('Заказ уже принят', 'Обнови список.');
          else { setFare(p => ({ ...p, [o.id]: '' })); await loadOrders(); }
        }} />
      </Card>)}
      <Text style={s.section}>Мои активные поездки</Text>
      {orders.filter(o => ACTIVE.includes(o.status) && o.driver_id === user.id).map(o => <Card key={o.id}>
        <Pill>{STATUS[o.status] || o.status}</Pill><Text style={s.address}>Забрать: {o.pickup_address}</Text><Text style={s.address}>Доставить: {o.destination_address}</Text>
        {o.status === 'accepted' && <Button title="Я на месте" onPress={() => updateOrder(o, 'arrived')} />}
        {o.status === 'arrived' && <Button title="Начать поездку" onPress={() => updateOrder(o, 'in_progress')} />}
        {o.status === 'in_progress' && <Button title="Завершить поездку" onPress={() => updateOrder(o, 'completed')} />}
      </Card>)}
      {orders.filter(o => ACTIVE.includes(o.status) && o.driver_id === user.id).length === 0 && <Card><Text style={s.muted}>Активных назначенных заказов пока нет.</Text></Card>}
    </ScrollView>}

    {mode === 'admin' && <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Панель администратора</Text>
      <View style={s.stats}><Card style={s.stat}><Text style={s.statNum}>{orders.length}</Text><Text style={s.muted}>Заказов</Text></Card><Card style={s.stat}><Text style={s.statNum}>{applications.filter(a => a.status === 'pending').length}</Text><Text style={s.muted}>Заявок</Text></Card></View>
      <Text style={s.section}>Заявки водителей</Text>
      {applications.map(a => <Card key={a.id}><Text style={s.tariffName}>{a.full_name || 'Водитель'}</Text><Text style={s.muted}>{a.phone}</Text><Text style={s.muted}>{a.car}</Text><Pill color={a.status === 'approved' ? C.green : a.status === 'rejected' ? C.red : C.pink}>{a.status}</Pill>
        {a.status === 'pending' && <View style={s.row}><View style={{ flex: 1 }}><Button title="Одобрить" onPress={() => reviewApplication(a, true)} /></View><View style={{ flex: 1 }}><Button title="Отклонить" secondary danger onPress={() => reviewApplication(a, false)} /></View></View>}
      </Card>)}
      <Text style={s.section}>Последние заказы</Text>
      {orders.slice(0, 12).map(o => <Card key={o.id}><Pill>{STATUS[o.status] || o.status}</Pill><Text style={s.address}>{o.pickup_address} → {o.destination_address}</Text></Card>)}
    </ScrollView>}

    {mode === 'passenger' && tab === 'profile' && <ScrollView contentContainerStyle={s.content}>
      <Text style={s.title}>Профиль</Text><Card><Text style={s.tariffName}>{profile?.email}</Text><Text style={s.muted}>Роль: {role}</Text></Card>
      {!isDriver && !isAdmin && <Card><Text style={s.section}>Стать водителем</Text><Input label="ФИО" value={applicationName} onChangeText={setApplicationName} /><Input label="Телефон" value={applicationPhone} onChangeText={setApplicationPhone} keyboardType="phone-pad" /><Input label="Автомобиль" value={applicationCar} onChangeText={setApplicationCar} /><Input label="Опыт и комментарий" value={applicationNote} onChangeText={setApplicationNote} multiline /><Button title="Отправить заявку" onPress={submitApplication} disabled={busy} /></Card>}
      <Button title="Связаться с поддержкой" secondary onPress={() => Linking.openURL('mailto:' + SUPPORT)} />
      <Button title="Позвонить водителю" secondary onPress={() => Linking.openURL('tel:' + PHONE)} />
      <Button title="Выйти из аккаунта" danger secondary onPress={logout} />
    </ScrollView>}

    <View style={s.bottomNav}>
      {(mode === 'passenger' ? [{ id: 'ride', label: 'Заказать', icon: '⌖' }, { id: 'trips', label: 'Поездки', icon: '▤' }, { id: 'profile', label: 'Профиль', icon: '◯' }] : [{ id: 'ride', label: mode === 'admin' ? 'Обзор' : 'Работа', icon: '⌖' }, { id: 'profile', label: 'Профиль', icon: '◯' }]).map(item =>
        <TouchableOpacity key={item.id} onPress={() => setTab(item.id)} style={s.navItem}>
          <Text style={[s.navIcon, tab === item.id && { color: C.pink }]}>{item.icon}</Text>
          <Text style={[s.navLabel, tab === item.id && { color: C.pink, fontWeight: '800' }]}>{item.label}</Text>
        </TouchableOpacity>)}
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: C.pale },
  auth: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: C.pale },
  brand: { color: C.pink, fontSize: 42, fontWeight: '900', textAlign: 'center', letterSpacing: -1 },
  brandSmall: { color: C.pink, fontSize: 26, fontWeight: '900', letterSpacing: -0.7 },
  tagline: { textAlign: 'center', color: C.muted, marginBottom: 28, marginTop: 4 },
  topSub: { color: C.muted, fontSize: 11, marginTop: -2 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.pinkDark, fontSize: 17, fontWeight: '800' },
  rolebar: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: C.pale, borderRadius: 15, padding: 4, marginBottom: 4 },
  roleButton: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  roleActive: { backgroundColor: C.white, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  roleText: { color: C.muted, fontWeight: '700', fontSize: 12 },
  roleTextActive: { color: C.pinkDark },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  mapWrap: { height: 245, borderRadius: 20, overflow: 'hidden', position: 'relative', backgroundColor: C.map },
  map: { flex: 1 },
  locButton: { position: 'absolute', bottom: 12, right: 12, backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, elevation: 3 },
  locText: { color: C.ink, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: C.white, borderRadius: 19, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 },
  title: { fontSize: 23, fontWeight: '900', color: C.ink, letterSpacing: -0.4 },
  heading: { fontSize: 19, fontWeight: '800', color: C.ink },
  section: { color: C.ink, fontSize: 16, fontWeight: '800', marginTop: 4 },
  field: { gap: 6, marginTop: 4 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: C.ink, backgroundColor: '#FFFCFD', fontSize: 15 },
  button: { backgroundColor: C.pink, paddingVertical: 15, paddingHorizontal: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonSecondary: { backgroundColor: C.pale, borderWidth: 1, borderColor: '#F5D8E3' },
  buttonDanger: { backgroundColor: '#FFF5F6', borderColor: '#F1D6DC' },
  buttonText: { color: C.white, fontWeight: '800', fontSize: 14 },
  muted: { color: C.muted, fontSize: 12, lineHeight: 18 },
  routeInfo: { color: C.pinkDark, fontWeight: '800', fontSize: 13, paddingTop: 4 },
  tariff: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  tariffSelected: { borderColor: C.pink, backgroundColor: C.pale },
  tariffIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  tariffEmoji: { color: C.pink, fontSize: 22, fontWeight: '900' },
  tariffName: { color: C.ink, fontWeight: '800', fontSize: 15 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D8CBD1' },
  radioOn: { borderColor: C.pink, backgroundColor: C.pink, shadowColor: C.pink, shadowOpacity: 0.2, shadowRadius: 3 },
  disclaimer: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.white },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  price: { color: C.ink, fontWeight: '900', fontSize: 14 },
  address: { color: C.ink, fontSize: 14, lineHeight: 21 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 26, color: C.pink, fontWeight: '900' },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, paddingBottom: Platform.OS === 'android' ? 8 : 4, backgroundColor: C.white },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navIcon: { color: C.muted, fontSize: 20, fontWeight: '700' },
  navLabel: { color: C.muted, fontSize: 10, fontWeight: '600' },
});
