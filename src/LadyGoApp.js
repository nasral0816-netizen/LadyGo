import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, Linking, Platform, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { Camera, GeoJSONSource, Layer, Map as MapLibreView } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { supabase } from './supabase';

const P = {
  pink: '#E84F87', pinkDark: '#C93670', pale: '#FFF0F5', ink: '#19171B',
  muted: '#817A80', line: '#ECE8EB', white: '#FFFFFF', green: '#16845B',
  map: 'https://tiles.openfreemap.org/styles/liberty'
};
const TARIFFS = [
  { id: 'economy', name: 'Эконом', sub: 'Выгодно на каждый день', icon: '↗' },
  { id: 'comfort', name: 'Комфорт', sub: 'Больше пространства', icon: '✦' },
  { id: 'comfort_plus', name: 'Комфорт+', sub: 'Максимум комфорта', icon: '✧' }
];
const STATUS = { new: 'Ищем водителя', accepted: 'Водитель назначен', arrived: 'Водитель на месте', in_progress: 'В пути', completed: 'Завершена', cancelled: 'Отменена', declined: 'Отклонена' };
const fmt = n => Number(n || 0).toLocaleString('ru-RU') + ' ₽';

async function findAddresses(q) {
  const url = 'https://photon.komoot.io/api/?lang=ru&limit=8&q=' + encodeURIComponent(q + ', Кисловодск, Россия');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Поиск адресов временно недоступен');
  const json = await response.json();
  return (json.features || []).map((f, i) => {
    const p = f.properties || {}, c = f.geometry?.coordinates || [];
    const street = p.street || p.name || p.city || 'Адрес';
    const label = [street, p.housenumber, p.city || p.town || p.village].filter(Boolean).join(', ');
    return { id: String(p.osm_id || i), label, detail: [p.district, p.city || p.town, p.state].filter(Boolean).join(', '), latitude: Number(c[1]), longitude: Number(c[0]) };
  }).filter(x => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
}

function MapPanel({ pickup, destination, route, onLocate }) {
  const points = [pickup && { ...pickup, label: 'А', color: P.green }, destination && { ...destination, label: 'Б', color: P.pink }].filter(Boolean);
  const features = points.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] }, properties: { label: p.label, color: p.color } }));
  const line = { type: 'Feature', geometry: { type: 'LineString', coordinates: route.map(p => [p.longitude, p.latitude]) }, properties: {} };
  const coords = points.map(p => [p.longitude, p.latitude]).concat(route.map(p => [p.longitude, p.latitude]));
  const center = coords.length ? [coords.reduce((s,p)=>s+p[0],0)/coords.length, coords.reduce((s,p)=>s+p[1],0)/coords.length] : [42.7168,43.9052];
  return <View style={st.map}>
    <MapLibreView style={{ flex: 1 }} mapStyle={P.map} androidView="texture" attribution logo={false} compass dragPan touchZoom doubleTapZoom>
      <Camera centerCoordinate={center} zoomLevel={coords.length > 1 ? 12 : 13} animationMode="flyTo" animationDuration={500} />
      {route.length > 1 && <GeoJSONSource id="route" data={line}>
        <Layer id="route-outline" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 9, 'line-cap': 'round', 'line-join': 'round' }} />
        <Layer id="route-main" type="line" paint={{ 'line-color': P.pink, 'line-width': 5, 'line-cap': 'round', 'line-join': 'round' }} />
      </GeoJSONSource>}
      {features.length > 0 && <GeoJSONSource id="markers" data={{ type: 'FeatureCollection', features }}>
        <Layer id="marker-circles" type="circle" paint={{ 'circle-radius': 9, 'circle-color': ['get','color'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }} />
      </GeoJSONSource>}
    </MapLibreView>
    <TouchableOpacity style={st.locate} onPress={onLocate}><Text style={st.locateText}>◎</Text></TouchableOpacity>
    <View style={st.mapLabel}><View style={st.liveDot}/><Text style={st.mapLabelText}>Кисловодск</Text></View>
  </View>;
}

function Field({ label, value, onChangeText, placeholder, onFocus, icon, autoCapitalize = 'sentences' }) {
  return <View style={st.field}>
    <Text style={st.fieldIcon}>{icon}</Text>
    <View style={{ flex: 1 }}>
      <Text style={st.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} onFocus={onFocus} placeholder={placeholder}
        placeholderTextColor="#A9A2A7" style={st.fieldInput} autoCapitalize={autoCapitalize} returnKeyType="search" />
    </View>
  </View>;
}

export default function LadyGoApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [boot, setBoot] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('ride');
  const [pickupText, setPickupText] = useState('Моё местоположение');
  const [destinationText, setDestinationText] = useState('');
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [searchField, setSearchField] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [route, setRoute] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [tariff, setTariff] = useState('economy');
  const [payment, setPayment] = useState('cash');
  const [quote, setQuote] = useState(null);
  const [orders, setOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [phone, setPhone] = useState('');

  const loadProfile = useCallback(async u => {
    if (!u || !supabase) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
    setProfile(data || { id: u.id, email: u.email, role: 'passenger' });
    setPhone(data?.phone || u.user_metadata?.phone || '');
  }, []);

  const loadOrders = useCallback(async () => {
    if (!session?.user || !supabase) return;
    const { data, error } = await supabase.from('orders').select('*').eq('passenger_id', session.user.id).order('created_at', { ascending: false }).limit(30);
    if (error) return;
    setOrders(data || []);
    setActiveOrder((data || []).find(o => ['new','accepted','arrived','in_progress'].includes(o.status)) || null);
  }, [session]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { setBoot(false); return; }
      const { data } = await supabase.auth.getSession();
      if (alive && data.session) { setSession(data.session); await loadProfile(data.session.user); }
      if (alive) setBoot(false);
    })();
    const { data: listener } = supabase?.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next?.user) await loadProfile(next.user); else { setProfile(null); setOrders([]); setActiveOrder(null); }
    }) || { data: { subscription: null } };
    return () => { alive = false; listener?.subscription?.unsubscribe(); };
  }, [loadProfile]);

  useEffect(() => { if (session?.user) loadOrders(); }, [session, loadOrders]);
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setSuggestions([]); return; }
    let alive = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try { const result = await findAddresses(query); if (alive) setSuggestions(result); }
      catch (_) { if (alive) setSuggestions([]); }
      finally { if (alive) setSearching(false); }
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  const signIn = async () => {
    if (!email.trim() || password.length < 6) return Alert.alert('Проверь данные', 'Введи email и пароль не короче 6 символов.');
    setBusy(true);
    try {
      const result = register
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (register && !result.data.session) Alert.alert('Почти готово', 'Подтверди email по письму, затем войди в LadyGo.');
    } catch (e) { Alert.alert('Не удалось войти', e.message || 'Попробуй ещё раз.'); }
    finally { setBusy(false); }
  };

  const locate = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return Alert.alert('Нужен доступ к геолокации', 'Разреши LadyGo определять место подачи.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setPickup(point);
      const places = await Location.reverseGeocodeAsync(point).catch(() => []);
      const p = places?.[0] || {};
      setPickupText([p.street, p.streetNumber, p.city || p.subregion].filter(Boolean).join(', ') || 'Моё местоположение');
    } catch (_) { Alert.alert('Не удалось определить место', 'Попробуй ещё раз или введи адрес вручную.'); }
  };

  const chooseSuggestion = async item => {
    const point = { latitude: item.latitude, longitude: item.longitude };
    if (searchField === 'pickup') { setPickup(point); setPickupText(item.label); }
    else { setDestination(point); setDestinationText(item.label); }
    setSuggestions([]); setSearchField(''); setQuery(''); Keyboard.dismiss();
  };

  useEffect(() => {
    let alive = true;
    const build = async () => {
      if (!pickup || !destination) { setRoute([]); setRouteInfo(null); setQuote(null); return; }
      try {
        const url = 'https://router.project-osrm.org/route/v1/driving/' + pickup.longitude + ',' + pickup.latitude + ';' + destination.longitude + ',' + destination.latitude + '?overview=full&geometries=geojson';
        const response = await fetch(url);
        const json = await response.json();
        const r = json.routes?.[0];
        if (!r) throw new Error('Маршрут не найден');
        const points = r.geometry.coordinates.map(c => ({ longitude: c[0], latitude: c[1] }));
        if (alive) { setRoute(points); setRouteInfo({ km: (r.distance / 1000).toFixed(1), minutes: Math.max(1, Math.round(r.duration / 60)) }); }
      } catch (_) { if (alive) { setRoute([]); setRouteInfo(null); } }
    };
    build();
    return () => { alive = false; };
  }, [pickup, destination]);

  useEffect(() => {
    let alive = true;
    const getQuote = async () => {
      if (!pickup || !destination || !routeInfo || !supabase) { setQuote(null); return; }
      try {
        const { data, error } = await supabase.functions.invoke('pricing-service', {
          body: { action: 'quote', city_id: 'kislovodsk', tariff_id: tariff, points: [pickup, destination], options: [] }
        });
        if (error) throw error;
        if (alive && data?.price_token) setQuote(data); else if (alive) setQuote(null);
      } catch (_) { if (alive) setQuote(null); }
    };
    getQuote();
    return () => { alive = false; };
  }, [pickup, destination, routeInfo, tariff]);

  const createOrder = async () => {
    if (!session?.user) return;
    if (!pickup || !destination) return Alert.alert('Укажи маршрут', 'Выбери адрес подачи и назначения из подсказок.');
    if (!quote?.price_token || !quote?.expires_at || new Date(quote.expires_at).getTime() <= Date.now()) return Alert.alert('Обновляем стоимость', 'Подожди расчёт цены и попробуй ещё раз.');
    setBusy(true);
    try {
      const payload = {
        passenger_id: session.user.id, pickup_address: pickupText, destination_address: destinationText,
        requested_for: 'Как можно скорее', passenger_phone: phone.trim() || null,
        notes: 'Тариф: ' + (TARIFFS.find(t => t.id === tariff)?.name || 'Эконом') + ' · Оплата: ' + (payment === 'cash' ? 'Наличные' : 'Перевод водителю'),
        status: 'new', payment_method: payment, tariff_id: tariff,
        pickup_lat: pickup.latitude, pickup_lng: pickup.longitude,
        destination_lat: destination.latitude, destination_lng: destination.longitude,
        estimated_price_rub: quote.amount_rub, price_quote_id: quote.price_token
      };
      const { error } = await supabase.from('orders').insert(payload);
      if (error) throw error;
      Alert.alert('Заказ создан', 'LadyGo ищет водителя. Стоимость и детали поездки будут доступны в заказе.');
      setTab('orders'); await loadOrders();
    } catch (e) { Alert.alert('Не удалось оформить заказ', e.message || 'Попробуй ещё раз.'); }
    finally { setBusy(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); setTab('ride'); };
  const cancelOrder = async order => {
    Alert.alert('Отменить заказ?', 'Водитель ещё не должен был принять поездку.', [
      { text: 'Не отменять', style: 'cancel' },
      { text: 'Отменить', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('cancel_my_order', { p_order_id: order.id });
        if (error) Alert.alert('Не удалось отменить', error.message);
        else loadOrders();
      }}
    ]);
  };

  if (boot) return <View style={st.loading}><ActivityIndicator size="large" color={P.pink}/><Text style={st.muted}>Загружаем LadyGo…</Text></View>;
  if (!session) return <SafeAreaView style={st.auth}><StatusBar barStyle="dark-content" backgroundColor={P.white}/>
    <View style={st.authLogo}><Text style={st.logo}>LadyGo</Text><Text style={st.tagline}>Поездки с заботой</Text></View>
    <View style={st.authCard}><Text style={st.heading}>{register ? 'Создать аккаунт' : 'С возвращением'}</Text>
      <TextInput style={st.authInput} value={email} onChangeText={setEmail} placeholder="Электронная почта" autoCapitalize="none" keyboardType="email-address"/>
      <TextInput style={st.authInput} value={password} onChangeText={setPassword} placeholder="Пароль" secureTextEntry/>
      <TouchableOpacity style={st.primaryBtn} onPress={signIn} disabled={busy}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={st.primaryText}>{register ? 'Зарегистрироваться' : 'Войти'}</Text>}</TouchableOpacity>
      <TouchableOpacity onPress={() => setRegister(!register)}><Text style={st.switchText}>{register ? 'Уже есть аккаунт? Войти' : 'Создать новый аккаунт'}</Text></TouchableOpacity>
    </View>
    <Text style={st.footnote}>Создано независимым автором @acyma</Text>
  </SafeAreaView>;

  if (searchField) return <SafeAreaView style={st.searchScreen}>
    <View style={st.searchTop}><TouchableOpacity onPress={() => { setSearchField(''); setSuggestions([]); Keyboard.dismiss(); }}><Text style={st.back}>‹</Text></TouchableOpacity>
      <TextInput autoFocus value={query} onChangeText={setQuery} placeholder={searchField === 'pickup' ? 'Откуда поедем?' : 'Куда поедем?'} style={st.searchInput}/>
      <TouchableOpacity onPress={() => setQuery('')}><Text style={st.clear}>×</Text></TouchableOpacity>
    </View>
    {searching && <ActivityIndicator color={P.pink} style={{ marginTop: 20 }}/>}
    <ScrollView keyboardShouldPersistTaps="handled">
      {suggestions.map(item => <TouchableOpacity key={item.id} style={st.suggestion} onPress={() => chooseSuggestion(item)}>
        <View style={st.suggestionIcon}><Text>⌖</Text></View><View style={{ flex: 1 }}><Text style={st.suggestionTitle}>{item.label}</Text><Text style={st.suggestionSub}>{item.detail || 'Кисловодск'}</Text></View>
      </TouchableOpacity>)}
      {!searching && query.length > 1 && suggestions.length === 0 && <Text style={st.empty}>Адрес не найден. Попробуй написать улицу и номер дома.</Text>}
    </ScrollView>
  </SafeAreaView>;

  return <SafeAreaView style={st.screen}><StatusBar barStyle="dark-content" backgroundColor={P.white}/>
    <View style={st.topbar}><View><Text style={st.logoSmall}>LadyGo</Text><Text style={st.topSub}>Поездки с заботой</Text></View>
      <TouchableOpacity style={st.avatar} onPress={() => setTab('profile')}><Text style={st.avatarText}>{(profile?.email || 'L').slice(0,1).toUpperCase()}</Text></TouchableOpacity>
    </View>
    {tab === 'ride' && <View style={{ flex: 1 }}>
      <MapPanel pickup={pickup} destination={destination} route={route} onLocate={locate}/>
      <ScrollView style={st.sheet} contentContainerStyle={st.sheetContent} keyboardShouldPersistTaps="handled">
        <View style={st.sheetHandle}/>
        <View style={st.rowBetween}><Text style={st.heading}>Куда едем?</Text><View style={st.cityPill}><Text style={st.cityPillText}>Кисловодск</Text></View></View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => { setSearchField('pickup'); setQuery(''); }}><Field label="ОТКУДА" value={pickupText} placeholder="Выберите место подачи" icon="●"/></TouchableOpacity>
        <View style={st.connector}/>
        <TouchableOpacity activeOpacity={0.8} onPress={() => { setSearchField('destination'); setQuery(''); }}><Field label="КУДА" value={destinationText} placeholder="Введите адрес назначения" icon="●"/></TouchableOpacity>
        <TouchableOpacity style={st.locateRow} onPress={locate}><Text style={st.locateRowIcon}>◎</Text><Text style={st.locateRowText}>Определить моё местоположение</Text></TouchableOpacity>
        {routeInfo && <View style={st.routeMeta}><Text style={st.routeMetaText}>Маршрут {routeInfo.km} км</Text><Text style={st.routeMetaText}>Около {routeInfo.minutes} мин</Text></View>}
        <Text style={st.sectionTitle}>Выберите тариф</Text>
        <View style={st.tariffs}>{TARIFFS.map(t => <TouchableOpacity key={t.id} onPress={() => setTariff(t.id)} style={[st.tariff, tariff === t.id && st.tariffSelected]}>
          <Text style={st.tariffIcon}>{t.icon}</Text><Text style={st.tariffName}>{t.name}</Text>{quote?.amount_rub && tariff === t.id ? <Text style={st.tariffPrice}>{fmt(quote.amount_rub)}</Text> : null}
        </TouchableOpacity>)}</View>
        <View style={st.priceCard}><View style={{ flex: 1 }}><Text style={st.priceTitle}>{quote?.amount_rub ? 'Предварительная стоимость' : 'Стоимость поездки'}</Text><Text style={st.priceHint}>{quote?.amount_rub ? 'Цена рассчитана по маршруту' : 'Укажи оба адреса для расчёта'}</Text></View><Text style={st.priceValue}>{quote?.amount_rub ? fmt(quote.amount_rub) : '—'}</Text></View>
        <Text style={st.sectionTitle}>Способ оплаты</Text>
        <View style={st.payRow}><TouchableOpacity onPress={() => setPayment('cash')} style={[st.payOption, payment === 'cash' && st.paySelected]}><Text style={st.payIcon}>₽</Text><Text style={st.payText}>Наличные</Text></TouchableOpacity><TouchableOpacity onPress={() => setPayment('transfer_to_driver')} style={[st.payOption, payment === 'transfer_to_driver' && st.paySelected]}><Text style={st.payIcon}>↗</Text><Text style={st.payText}>Перевод водителю</Text></TouchableOpacity></View>
        <TextInput style={st.phoneInput} value={phone} onChangeText={setPhone} placeholder="Телефон для связи (необязательно)" keyboardType="phone-pad"/>
        <TouchableOpacity style={[st.primaryBtn, (!pickup || !destination || !quote?.price_token || busy) && st.disabled]} onPress={createOrder} disabled={!pickup || !destination || !quote?.price_token || busy}>
          {busy ? <ActivityIndicator color="#fff"/> : <Text style={st.primaryText}>Заказать поездку</Text>}
        </TouchableOpacity>
        <Text style={st.footnote}>Создано независимым автором @acyma</Text>
      </ScrollView>
    </View>}
    {tab === 'orders' && <ScrollView contentContainerStyle={st.pageContent}>
      <Text style={st.pageTitle}>Мои поездки</Text>
      {orders.length === 0 ? <View style={st.emptyCard}><Text style={st.emptyIcon}>⌁</Text><Text style={st.heading}>Пока нет поездок</Text><Text style={st.muted}>Оформленные заказы появятся здесь.</Text><TouchableOpacity style={st.primaryBtn} onPress={() => setTab('ride')}><Text style={st.primaryText}>Заказать поездку</Text></TouchableOpacity></View> :
        orders.map(o => <View key={o.id} style={st.orderCard}><View style={st.rowBetween}><Text style={st.orderStatus}>{STATUS[o.status] || o.status}</Text><Text style={st.orderDate}>{new Date(o.created_at).toLocaleDateString('ru-RU')}</Text></View><Text style={st.orderAddress}>●  {o.pickup_address}</Text><Text style={st.orderAddress}>●  {o.destination_address}</Text><View style={st.rowBetween}><Text style={st.orderPrice}>{o.price_rub ? fmt(o.price_rub) : 'Цена уточняется'}</Text>{o.status === 'new' && <TouchableOpacity onPress={() => cancelOrder(o)}><Text style={st.cancelText}>Отменить</Text></TouchableOpacity>}</View></View>)}
    </ScrollView>}
    {tab === 'profile' && <ScrollView contentContainerStyle={st.pageContent}><Text style={st.pageTitle}>Профиль</Text>
      <View style={st.profileCard}><View style={st.profileAvatar}><Text style={st.profileAvatarText}>{(profile?.email || 'L').slice(0,1).toUpperCase()}</Text></View><Text style={st.heading}>{profile?.email || session.user.email}</Text><Text style={st.muted}>{profile?.role === 'driver' ? 'Водитель' : profile?.role === 'admin' ? 'Администратор' : 'Пассажир'}</Text></View>
      <TouchableOpacity style={st.profileRow} onPress={() => setTab('orders')}><Text style={st.profileRowIcon}>◷</Text><Text style={st.profileRowText}>История поездок</Text><Text style={st.chevron}>›</Text></TouchableOpacity>
      <TouchableOpacity style={st.profileRow} onPress={() => Linking.openURL('mailto:ladygosupport@gmail.com')}><Text style={st.profileRowIcon}>?</Text><Text style={st.profileRowText}>Поддержка</Text><Text style={st.chevron}>›</Text></TouchableOpacity>
      <TouchableOpacity style={st.profileRow} onPress={() => Linking.openURL('tel:+79911121227')}><Text style={st.profileRowIcon}>☎</Text><Text style={st.profileRowText}>Заказать по телефону</Text><Text style={st.chevron}>›</Text></TouchableOpacity>
      <TouchableOpacity style={st.logout} onPress={signOut}><Text style={st.logoutText}>Выйти из аккаунта</Text></TouchableOpacity>
      <Text style={st.footnote}>LadyGo · 6.8.0 · Создано независимым автором @acyma</Text>
    </ScrollView>}
    <View style={st.bottomNav}>
      {[['ride','⌖','Заказать'],['orders','◷','Поездки'],['profile','○','Профиль']].map(([id,icon,label]) => <TouchableOpacity key={id} style={st.navItem} onPress={() => setTab(id)}><Text style={[st.navIcon, tab === id && st.navActive]}>{icon}</Text><Text style={[st.navLabel, tab === id && st.navActive]}>{label}</Text></TouchableOpacity>)}
    </View>
  </SafeAreaView>;
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.white },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: P.white },
  auth: { flex: 1, backgroundColor: P.white, padding: 24, justifyContent: 'center' },
  authLogo: { alignItems: 'center', marginBottom: 38 },
  logo: { color: P.pink, fontSize: 42, fontWeight: '900', letterSpacing: -2 },
  tagline: { color: P.muted, fontSize: 15, marginTop: 4 },
  authCard: { gap: 14 },
  heading: { color: P.ink, fontSize: 22, fontWeight: '850', letterSpacing: -0.4 },
  authInput: { borderWidth: 1, borderColor: P.line, borderRadius: 16, padding: 17, fontSize: 16, color: P.ink, backgroundColor: '#FBFAFB' },
  primaryBtn: { backgroundColor: P.pink, minHeight: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 8 },
  primaryText: { color: P.white, fontSize: 16, fontWeight: '800' },
  switchText: { color: P.pinkDark, textAlign: 'center', fontWeight: '700', padding: 12 },
  footnote: { color: '#A69DA3', fontSize: 11, textAlign: 'center', marginTop: 20 },
  topbar: { height: 62, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: P.white, borderBottomWidth: 1, borderColor: '#F2EEF0' },
  logoSmall: { color: P.pink, fontSize: 25, fontWeight: '900', letterSpacing: -1 },
  topSub: { color: P.muted, fontSize: 10, marginTop: -2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: P.pinkDark, fontWeight: '900', fontSize: 16 },
  map: { height: 280, backgroundColor: '#E9E7E3' },
  locate: { position: 'absolute', right: 14, bottom: 14, width: 44, height: 44, borderRadius: 15, backgroundColor: P.white, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  locateText: { color: P.pink, fontSize: 27, fontWeight: '700' },
  mapLabel: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: P.white, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: P.green },
  mapLabelText: { color: P.ink, fontSize: 12, fontWeight: '700' },
  sheet: { flex: 1, backgroundColor: P.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -18 },
  sheetContent: { padding: 18, paddingBottom: 26, gap: 12 },
  sheetHandle: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#DDD7DC', alignSelf: 'center', marginBottom: 3 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cityPill: { backgroundColor: P.pale, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20 },
  cityPillText: { color: P.pinkDark, fontSize: 11, fontWeight: '800' },
  field: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FAF9FA', borderWidth: 1, borderColor: P.line, borderRadius: 16 },
  fieldIcon: { color: P.pink, fontSize: 16, fontWeight: '900' },
  fieldLabel: { color: P.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  fieldInput: { color: P.ink, fontSize: 16, padding: 0, marginTop: 3, minHeight: 25 },
  connector: { height: 7, width: 1, backgroundColor: '#D7CDD3', marginLeft: 23, marginTop: -12, marginBottom: -12, zIndex: 2 },
  locateRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  locateRowIcon: { color: P.pink, fontSize: 18 },
  locateRowText: { color: P.pinkDark, fontSize: 13, fontWeight: '700' },
  routeMeta: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F8F6F7', padding: 11, borderRadius: 12 },
  routeMetaText: { color: P.muted, fontSize: 12, fontWeight: '700' },
  sectionTitle: { color: P.ink, fontSize: 15, fontWeight: '850', marginTop: 6 },
  tariffs: { flexDirection: 'row', gap: 8 },
  tariff: { flex: 1, minHeight: 80, borderWidth: 1, borderColor: P.line, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 7, gap: 5, backgroundColor: P.white },
  tariffSelected: { borderColor: P.pink, backgroundColor: P.pale },
  tariffIcon: { color: P.pink, fontSize: 20, fontWeight: '900' },
  tariffName: { color: P.ink, fontSize: 12, fontWeight: '800' },
  tariffPrice: { color: P.pinkDark, fontSize: 11, fontWeight: '800' },
  priceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAF7F8', borderRadius: 15, padding: 14, gap: 10 },
  priceTitle: { color: P.ink, fontWeight: '800', fontSize: 13 },
  priceHint: { color: P.muted, fontSize: 11, marginTop: 3 },
  priceValue: { color: P.pinkDark, fontWeight: '900', fontSize: 19 },
  payRow: { flexDirection: 'row', gap: 9 },
  payOption: { flex: 1, borderWidth: 1, borderColor: P.line, borderRadius: 13, padding: 12, alignItems: 'center', gap: 4 },
  paySelected: { borderColor: P.pink, backgroundColor: P.pale },
  payIcon: { color: P.pink, fontSize: 18, fontWeight: '900' },
  payText: { color: P.ink, fontSize: 12, fontWeight: '700' },
  phoneInput: { borderWidth: 1, borderColor: P.line, borderRadius: 13, padding: 14, fontSize: 14, color: P.ink },
  disabled: { opacity: 0.45 },
  bottomNav: { height: 62, flexDirection: 'row', borderTopWidth: 1, borderColor: P.line, backgroundColor: P.white, paddingBottom: Platform.OS === 'android' ? 4 : 0 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { color: '#A69EA4', fontSize: 21, fontWeight: '800' },
  navLabel: { color: '#9C949A', fontSize: 10, fontWeight: '700' },
  navActive: { color: P.pinkDark },
  searchScreen: { flex: 1, backgroundColor: P.white },
  searchTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, minHeight: 60, borderBottomWidth: 1, borderColor: P.line },
  back: { color: P.pink, fontSize: 34, lineHeight: 38 },
  searchInput: { flex: 1, fontSize: 17, color: P.ink, paddingVertical: 12 },
  clear: { color: P.muted, fontSize: 26, paddingHorizontal: 5 },
  suggestion: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 17, paddingVertical: 15, borderBottomWidth: 1, borderColor: '#F3EFF1' },
  suggestionIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: P.pale, alignItems: 'center', justifyContent: 'center' },
  suggestionTitle: { color: P.ink, fontSize: 15, fontWeight: '750' },
  suggestionSub: { color: P.muted, fontSize: 12, marginTop: 3 },
  empty: { color: P.muted, textAlign: 'center', padding: 25, lineHeight: 21 },
  pageContent: { padding: 18, gap: 13, paddingBottom: 28 },
  pageTitle: { color: P.ink, fontSize: 27, fontWeight: '900', marginBottom: 5 },
  emptyCard: { alignItems: 'center', padding: 28, backgroundColor: '#FAF8F9', borderRadius: 20, gap: 10 },
  emptyIcon: { color: P.pink, fontSize: 38 },
  muted: { color: P.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  orderCard: { borderWidth: 1, borderColor: P.line, borderRadius: 17, padding: 15, gap: 10, backgroundColor: P.white },
  orderStatus: { color: P.pinkDark, fontSize: 13, fontWeight: '900' },
  orderDate: { color: P.muted, fontSize: 11 },
  orderAddress: { color: P.ink, fontSize: 13, lineHeight: 19 },
  orderPrice: { color: P.ink, fontSize: 16, fontWeight: '900' },
  cancelText: { color: '#C23F5B', fontSize: 12, fontWeight: '800' },
  profileCard: { alignItems: 'center', backgroundColor: P.pale, borderRadius: 20, padding: 24, gap: 7 },
  profileAvatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: P.white, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  profileAvatarText: { color: P.pink, fontSize: 28, fontWeight: '900' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, borderBottomWidth: 1, borderColor: P.line },
  profileRowIcon: { color: P.pink, fontSize: 19, width: 24 },
  profileRowText: { flex: 1, color: P.ink, fontSize: 14, fontWeight: '700' },
  chevron: { color: P.muted, fontSize: 22 },
  logout: { alignItems: 'center', padding: 16, marginTop: 8 },
  logoutText: { color: '#C23F5B', fontSize: 14, fontWeight: '800' }
});
