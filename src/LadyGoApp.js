import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, Share, RefreshControl,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as TaskManager from 'expo-task-manager';
import * as ImagePicker from 'expo-image-picker';
import { supabase, isConfigured } from './supabase';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

const DRIVER_LOCATION_TASK = 'ladygo-driver-background-location';

if (!TaskManager.isTaskDefined(DRIVER_LOCATION_TASK)) {
  TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error || !supabase) return;
    const locations = data?.locations || [];
    const latest = locations[locations.length - 1];
    if (!latest?.coords) return;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const currentUser = authData?.user;
      if (authError || !currentUser) return;
      const [{ data: currentProfile }, { data: presence }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', currentUser.id).maybeSingle(),
        supabase.from('driver_presence').select('is_online').eq('driver_id', currentUser.id).maybeSingle(),
      ]);
      if (currentProfile?.role !== 'driver' || presence?.is_online !== true) return;
      const now = new Date().toISOString();
      const { latitude, longitude, heading } = latest.coords;
      const { error: locationError } = await supabase.from('driver_locations').upsert({
        driver_id: currentUser.id, latitude, longitude,
        heading: Number.isFinite(heading) ? heading : null,
        updated_at: now,
      });
      if (locationError) throw locationError;
      const { error: presenceError } = await supabase.from('driver_presence')
        .update({ updated_at: now }).eq('driver_id', currentUser.id).eq('is_online', true);
      if (presenceError) throw presenceError;
    } catch (taskError) {
      console.warn('LadyGo background location:', taskError?.message || taskError);
    }
  });
}

const C = {
  pink: '#E85D91', pinkDark: '#C94378', pale: '#FFF3F7',
  ink: '#282329', muted: '#8E8289', line: '#F0E5E9',
  white: '#FFFFFF', green: '#26865A', red: '#C34F63',
  blue: '#477FD1', map: '#F6F1ED',
};
const PHONE = '+79911121227';
const SUPPORT = 'ladygosupport@gmail.com';

// Фиксированные тарифы LadyGo: цена за маршрут, не за километр.
const FIXED_ROUTE_PRICES = [
  { aliases: ['минеральные воды', 'минводы'], price: 2200 },
  { aliases: ['медовые водопады', 'медовые'], price: 1200 },
  { aliases: ['красный восток'], price: 2000 },
  { aliases: ['первомайское'], price: 1350 },
  { aliases: ['кичи-балык', 'кичи балык', 'кичи балыкъ'], price: 1000 },
  { aliases: ['джегута'], price: 3500 },
  { aliases: ['карачаевск'], price: 5000 },
  { aliases: ['черкесск'], price: 4500 },
  { aliases: ['ставрополь'], price: 7500 },
  { aliases: ['ессентуки'], price: 1000 },
  { aliases: ['пятигорск'], price: 1500 },
  { aliases: ['учкекен'], price: 1200 },
  { aliases: ['терезе'], price: 1500 },
  { aliases: ['джагъа', "джаг а", "джаг"], price: 750 },
  { aliases: ['конзавод', 'конный завод'], price: 650 },
  { aliases: ['элькуш', 'елкуш'], price: 600 },
  { aliases: ['кисловодск'], price: 250 },
  { aliases: ['пригородные поселки'], price: 350 },
];
const normalizePlace = value => String(value || '').toLowerCase().replace(/ё/g, 'е')
  .replace(/[ъь]/g, '').replace(/[^а-яa-z0-9]+/g, ' ').trim();
const fixedRoutePrice = (destination, hasStops = false, priceList = FIXED_ROUTE_PRICES) => {
  if (hasStops) return null;
  const place = normalizePlace(destination);
  if (!place) return null;
  const suburb = /пригород|посел|село|станиц|окраин/.test(place);
  if (suburb && place.includes('ессентук')) {
    const item = priceList.find(row => row.route_key === 'essentuki_suburbs' && row.is_active !== false);
    return Number(item?.price_rub ?? 1100);
  }
  if (suburb && place.includes('пятигор')) {
    const item = priceList.find(row => row.route_key === 'pyatigorsk_suburbs' && row.is_active !== false);
    return Number(item?.price_rub ?? 1600);
  }
  const match = priceList.find(item => item.is_active !== false && (item.aliases || []).some(alias => place.includes(normalizePlace(alias))));
  if (match) return Number(match.price_rub ?? match.price);
  if (suburb) {
    const item = priceList.find(row => row.route_key === 'suburbs' && row.is_active !== false);
    return Number(item?.price_rub ?? 350);
  }
  return null;
};
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
function TripProgress({ status }) {
  const steps = [
    { id: 'new', label: 'Ищем водителя' },
    { id: 'accepted', label: 'Водитель назначен' },
    { id: 'arrived', label: 'Водитель на месте' },
    { id: 'in_progress', label: 'Поездка началась' },
    { id: 'completed', label: 'Поездка завершена' },
  ];
  const activeIndex = steps.findIndex(step => step.id === status);
  if (status === 'cancelled' || status === 'declined') {
    return <View style={{ backgroundColor: '#FFF5F6', borderRadius: 12, padding: 11 }}>
      <Text style={{ color: C.red, fontWeight: '800', fontSize: 13 }}>{status === 'cancelled' ? 'Поездка отменена' : 'Заказ отклонён'}</Text>
    </View>;
  }
  return <View style={{ gap: 8, paddingVertical: 5 }}>
    {steps.map((step, index) => {
      const done = activeIndex >= index;
      const current = activeIndex === index;
      return <View key={step.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 19, height: 19, borderRadius: 10, borderWidth: 2, borderColor: done ? C.pink : C.line, backgroundColor: done ? C.pink : C.white, alignItems: 'center', justifyContent: 'center' }}>
          {done ? <Text style={{ color: C.white, fontSize: 10, fontWeight: '900' }}>✓</Text> : null}
        </View>
        <Text style={{ color: current ? C.pinkDark : done ? C.ink : C.muted, fontSize: 12, fontWeight: current ? '800' : '600' }}>{step.label}</Text>
      </View>;
    })}
  </View>;
}
function Card({ children, style }) { return <View style={[s.card, style]}>{children}</View>; }


function LeafletMap({ points = [], route = [], height = 245 }) {
  const validPoints = points.filter(point =>
    Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
  ).map(point => ({
    latitude: Number(point.latitude), longitude: Number(point.longitude),
    label: String(point.label || ''), color: String(point.color || '#E85D91'),
  }));
  const validRoute = route.filter(point =>
    Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
  ).map(point => [Number(point.latitude), Number(point.longitude)]);
  const mapData = JSON.stringify({ points: validPoints, route: validRoute }).replace(/</g, '\\u003c');
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <style>html,body,#map{height:100%;width:100%;margin:0;background:#F6F1ED} .leaflet-control-attribution{font-size:9px}</style>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script></head>
    <body><div id="map"></div><script>
      const data = ${mapData};
      const map = L.map('map',{zoomControl:true,attributionControl:true}).setView([43.9,42.7],10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
      const bounds=[];
      data.points.forEach(p=>{const ll=[p.latitude,p.longitude];bounds.push(ll);L.circleMarker(ll,{radius:8,color:p.color,fillColor:p.color,fillOpacity:0.95,weight:2}).addTo(map).bindPopup(p.label);});
      if(data.route.length>1){data.route.forEach(p=>bounds.push(p));L.polyline(data.route,{color:'#E85D91',weight:5,opacity:.9}).addTo(map);}
      if(bounds.length===1)map.setView(bounds[0],14);else if(bounds.length>1)map.fitBounds(bounds,{padding:[24,24],maxZoom:15});
      setTimeout(()=>map.invalidateSize(),250);
    <\/script></body></html>`;
  return <View style={{ height, borderRadius: 15, overflow: 'hidden', backgroundColor: C.map }}>
    <WebView source={{ html }} originWhitelist={['*']} javaScriptEnabled domStorageEnabled
      setSupportMultipleWindows={false} mixedContentMode="never" style={{ flex: 1, backgroundColor: C.map }}
      renderError={() => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 14, backgroundColor: C.pale }}><Text style={s.tariffName}>Карта недоступна</Text><Text style={s.muted}>Проверь подключение к интернету. Заказ можно оформить по адресу.</Text></View>}
      onError={() => {}} />
  </View>;
}

function TripMap({ order, driverLocation }) {
  const [roadRoute, setRoadRoute] = useState([]);
  const [routeSummary, setRouteSummary] = useState(null);
  const [driverEtaMinutes, setDriverEtaMinutes] = useState(null);
  const hasCoords = order.pickup_lat != null && order.pickup_lng != null && order.destination_lat != null && order.destination_lng != null;
  const start = { latitude: Number(order.pickup_lat || 0), longitude: Number(order.pickup_lng || 0) };
  const end = { latitude: Number(order.destination_lat || 0), longitude: Number(order.destination_lng || 0) };
  const stops = Array.isArray(order.stops) ? order.stops.filter(point =>
    Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
  ).map(point => ({ latitude: Number(point.latitude), longitude: Number(point.longitude), address: point.address })) : [];
  const routePoints = [start, ...stops, end];
  const routeKey = routePoints.map(point => point.longitude + ',' + point.latitude).join(';');

  useEffect(() => {
    let active = true;
    if (!hasCoords) {
      setRoadRoute([]);
      setRouteSummary(null);
      return () => { active = false; };
    }
    setRoadRoute([]);
    setRouteSummary(null);
    fetch(`https://router.project-osrm.org/route/v1/driving/${routeKey}?overview=full&geometries=geojson`)
      .then(response => {
        if (!response.ok) throw new Error('Route service unavailable');
        return response.json();
      })
      .then(json => {
        const route = json.routes?.[0];
        if (!route?.geometry?.coordinates?.length) throw new Error('Route not found');
        if (!active) return;
        setRoadRoute(route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })));
        setRouteSummary({ km: (route.distance / 1000).toFixed(1), minutes: Math.max(1, Math.round(route.duration / 60)) });
      })
      .catch(() => { if (active) { setRoadRoute([]); setRouteSummary(null); } });
    return () => { active = false; };
  }, [hasCoords, routeKey]);

  useEffect(() => {
    let active = true;
    setDriverEtaMinutes(null);
    if (!driverLocation?.latitude || !driverLocation?.longitude || !hasCoords || !['accepted', 'arrived'].includes(order.status)) return () => { active = false; };
    fetch(`https://router.project-osrm.org/route/v1/driving/${driverLocation.longitude},${driverLocation.latitude};${start.longitude},${start.latitude}?overview=false`)
      .then(response => { if (!response.ok) throw new Error('ETA unavailable'); return response.json(); })
      .then(json => { const seconds = json.routes?.[0]?.duration; if (active && Number.isFinite(seconds)) setDriverEtaMinutes(Math.max(1, Math.round(seconds / 60))); })
      .catch(() => { if (active) setDriverEtaMinutes(null); });
    return () => { active = false; };
  }, [driverLocation?.latitude, driverLocation?.longitude, hasCoords, order.status, start.latitude, start.longitude]);

  if (!hasCoords) return null;
  return <View style={{ gap: 7 }}>
    {Platform.OS === 'android' ? <LeafletMap height={190} points={[
      { latitude: start.latitude, longitude: start.longitude, label: 'Подача', color: C.pink },
      ...stops.map((point, index) => ({ ...point, label: point.address || ('Остановка ' + (index + 1)), color: '#D69A35' })),
      { latitude: end.latitude, longitude: end.longitude, label: 'Назначение', color: C.blue },
      ...(driverLocation?.latitude != null && driverLocation?.longitude != null ? [{ latitude: driverLocation.latitude, longitude: driverLocation.longitude, label: 'Водитель LadyGo', color: '#26865A' }] : []),
    ]} route={roadRoute.length > 1 ? roadRoute : routePoints} /> : <MapView mapType="none" style={{ height: 190, borderRadius: 15, overflow: 'hidden' }} initialRegion={{ latitude: driverLocation?.latitude ?? (start.latitude + end.latitude) / 2, longitude: driverLocation?.longitude ?? (start.longitude + end.longitude) / 2, latitudeDelta: Math.max(0.02, Math.abs(start.latitude - end.latitude) * 1.8), longitudeDelta: Math.max(0.02, Math.abs(start.longitude - end.longitude) * 1.8) }}>
      <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />
      <Marker coordinate={start} title="Подача" pinColor={C.pink} />
      {driverLocation?.latitude != null && driverLocation?.longitude != null && <Marker coordinate={{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }} title="Водитель LadyGo" description="Текущее местоположение" pinColor="#26865A" />}
      {stops.map((point, index) => <Marker key={'trip-stop-' + index} coordinate={point} title={'Остановка ' + (index + 1)} description={point.address} pinColor="#D69A35" />)}
      <Marker coordinate={end} title="Назначение" pinColor={C.blue} />
      <Polyline coordinates={roadRoute.length > 1 ? roadRoute : routePoints} strokeColor={C.pink} strokeWidth={4} />
    </MapView>}
    {routeSummary && <Text style={s.routeInfo}>{routeSummary.km} км · около {routeSummary.minutes} мин по дороге</Text>}
    <Text style={s.muted}>© OpenStreetMap contributors</Text>
    {driverEtaMinutes != null && <Text style={[s.routeInfo, { color: C.green }]}>Водитель примерно через {driverEtaMinutes} мин</Text>}
    {driverLocation?.updated_at && <Text style={s.muted}>Геопозиция обновлена: {new Date(driverLocation.updated_at).toLocaleTimeString()}</Text>}
  </View>;
}


function TripChat({ order, userId }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const load = useCallback(async () => {
    if (!supabase || !order?.id) return;
    const { data, error } = await supabase.from('trip_messages').select('*')
      .eq('order_id', order.id).order('created_at', { ascending: true }).limit(200);
    if (!error) setMessages(data || []);
  }, [order?.id]);
  useEffect(() => {
    load();
    if (!supabase || !order?.id) return;
    const channel = supabase.channel('trip-chat-' + order.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_messages', filter: 'order_id=eq.' + order.id }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, order?.id]);
  const send = async () => {
    const message = draft.trim();
    if (!message || sending || !supabase) return;
    setSending(true);
    const { error } = await supabase.from('trip_messages').insert({
      order_id: order.id, sender_id: userId, message,
    });
    setSending(false);
    if (error) return Alert.alert('Сообщение не отправлено', errorText(error));
    setDraft('');
    await load();
  };
  return <View style={{ gap: 9, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
    <Text style={s.section}>Чат поездки</Text>
    {messages.length === 0 ? <Text style={s.muted}>Сообщений пока нет. Можно написать участнику поездки.</Text> :
      messages.map(item => <View key={item.id} style={{ alignSelf: item.sender_id === userId ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: item.sender_id === userId ? C.pale : '#F6F4F5', borderRadius: 13, padding: 10 }}>
        <Text style={s.address}>{item.message}</Text>
        <Text style={[s.muted, { fontSize: 10, textAlign: 'right' }]}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>)}
    <Input label="Сообщение" value={draft} onChangeText={setDraft} placeholder="Написать участнику поездки…" />
    <Button title={sending ? 'Отправляем…' : 'Отправить сообщение'} compact disabled={sending || !draft.trim()} onPress={send} />
  </View>;
}

const shareTripDetails = async order => {
  const tariffName = TARIFFS.find(item => item.id === order.tariff_id)?.name || 'Поездка';
  const stops = Array.isArray(order.stops) ? order.stops.map((stop, index) => (index + 1) + '. ' + stop.address).join('\n') : '';
  const details = [
    'LadyGo — детали поездки',
    'Номер заказа: ' + order.id,
    'Дата: ' + new Date(order.created_at).toLocaleString(),
    'Откуда: ' + order.pickup_address,
    stops ? 'Остановки:\n' + stops : '',
    'Куда: ' + order.destination_address,
    'Услуга: ' + (order.service_type === 'courier' ? 'Курьерская доставка' : 'Поездка'),
    order.door_to_door ? 'От двери до двери (+{configuredDoorToDoorPrice} ₽)' : '',
    'Тариф: ' + tariffName,
    'Стоимость: ' + money(order.price_rub),
    'Оплата: ' + (order.payment_method === 'transfer_to_driver' ? 'Перевод водителю' : 'Наличными'),
    'Статус: ' + (STATUS[order.status] || order.status),
  ].filter(Boolean).join('\n');
  try {
    await Share.share({ message: details });
  } catch (_) {
    Alert.alert('Поделиться поездкой', 'Не удалось открыть меню отправки.');
  }
};

const openDriverNavigation = async order => {
  const stops = Array.isArray(order.stops) ? order.stops : [];
  const waypoints = stops.slice(0, 3).map(stop => stop.address).filter(Boolean).join('|');
  const query = [
    'api=1',
    'destination=' + encodeURIComponent(order.destination_address || ''),
    'travelmode=driving',
    waypoints ? 'waypoints=' + encodeURIComponent(waypoints) : '',
  ].filter(Boolean).join('&');
  const url = 'https://www.google.com/maps/dir/?' + query;
  try {
    await Linking.openURL(url);
  } catch (_) {
    Alert.alert('Навигация', 'Не удалось открыть карты на этом устройстве.');
  }
};

async function getPositionWithFallback() {
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) throw new Error('На телефоне выключена геолокация. Включи «Местоположение» и повтори.');
  const cached = await Location.getLastKnownPositionAsync({ maxAge: 120000, requiredAccuracy: 1500 }).catch(() => null);
  let timer;
  try {
    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Телефон не смог определить координаты за 15 секунд. Проверь GPS и попробуй на улице.')), 15000); }),
    ]);
    return current;
  } catch (error) {
    if (cached) return cached;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function LadyGoApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState('passenger');
  const [tab, setTab] = useState('ride');
  const [authMode, setAuthMode] = useState('login');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [requestedFor, setRequestedFor] = useState('Как можно скорее');
  const [stopsText, setStopsText] = useState('');
  const [tariff, setTariff] = useState('economy');
  const [serviceType, setServiceType] = useState('ride');
  const [doorToDoor, setDoorToDoor] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [childAccompanied, setChildAccompanied] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [savedLabel, setSavedLabel] = useState('Дом');
  const [savedAddress, setSavedAddress] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [coords, setCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [stopCoords, setStopCoords] = useState([]);
  const [driverLocation, setDriverLocation] = useState(null);
  const [assignedDriver, setAssignedDriver] = useState(null);
  const [route, setRoute] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [orders, setOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [completedOrdersToRate, setCompletedOrdersToRate] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportReplyDraft, setSupportReplyDraft] = useState({});
  const [tariffRates, setTariffRates] = useState([]);
  const [rateDraft, setRateDraft] = useState({});
  const [fixedPrices, setFixedPrices] = useState([]);
  const [fixedPriceDraft, setFixedPriceDraft] = useState({});
  const [ratingDraft, setRatingDraft] = useState({});
  const [ratingComments, setRatingComments] = useState({});
  const [applications, setApplications] = useState([]);
  const [driverOnline, setDriverOnline] = useState(false);
  const [driverGpsError, setDriverGpsError] = useState('');
  const [driverGpsUpdatedAt, setDriverGpsUpdatedAt] = useState(null);
  const [fare, setFare] = useState({});
  const [offerTimes, setOfferTimes] = useState({});
  const [applicationName, setApplicationName] = useState('');
  const [applicationPhone, setApplicationPhone] = useState('');
  const [applicationCar, setApplicationCar] = useState('');
  const [applicationNote, setApplicationNote] = useState('');
  const [applicationVehicleMake, setApplicationVehicleMake] = useState('');
  const [applicationVehicleModel, setApplicationVehicleModel] = useState('');
  const [applicationVehicleColor, setApplicationVehicleColor] = useState('');
  const [applicationVehiclePlate, setApplicationVehiclePlate] = useState('');
  const [applicationVehicleYear, setApplicationVehicleYear] = useState('');
  const [applicationAvatarUri, setApplicationAvatarUri] = useState(null);
  const [applicationVehiclePhotoUri, setApplicationVehiclePhotoUri] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);
  const [driverProfileDraft, setDriverProfileDraft] = useState({});
  const [driverAvatarUri, setDriverAvatarUri] = useState(null);
  const [driverVehiclePhotoUri, setDriverVehiclePhotoUri] = useState(null);
  const locationWatch = useRef(null);
  const authProfileTimer = useRef(null);
  const mapRef = useRef(null);

  const user = session?.user;
  const role = profile?.role || 'passenger';
  const isAdmin = role === 'admin';
  const isDriver = role === 'driver';
  const activeOrder = useMemo(() => orders.find(o => ACTIVE.includes(o.status)), [orders]);
  const driverCompletedOrders = useMemo(() => orders.filter(order => order.status === 'completed'), [orders]);
  const driverRecentEarnings = useMemo(() => driverCompletedOrders.reduce((sum, order) => sum + Number(order.price_rub || 0), 0), [driverCompletedOrders]);
  const unreadCount = notifications.filter(item => !item.read_at).length;
  const selectedTariffRate = tariffRates.find(rate => rate.tariff_id === tariff && rate.is_active);
  const configuredCourierPrice = Number(fixedPrices.find(item => item.route_key === 'courier_delivery')?.price_rub ?? 300);
  const configuredDoorToDoorPrice = Number(fixedPrices.find(item => item.route_key === 'door_to_door')?.price_rub ?? 100);
  const fixedFare = serviceType === 'courier' ? configuredCourierPrice : fixedRoutePrice(destination, Boolean(stopsText.trim()), fixedPrices.length ? fixedPrices : FIXED_ROUTE_PRICES);
  const hasCustomRate = selectedTariffRate && (
    Number(selectedTariffRate.minimum_fare_rub) > 0 ||
    Number(selectedTariffRate.base_fare_rub) > 0 ||
    Number(selectedTariffRate.per_km_rub) > 0
  );
  const estimatedPrice = fixedFare != null
    ? fixedFare + (doorToDoor && serviceType === 'ride' ? configuredDoorToDoorPrice : 0)
    : routeInfo && hasCustomRate
      ? Math.round(Math.max(Number(selectedTariffRate.minimum_fare_rub), Number(selectedTariffRate.base_fare_rub) + Number(routeInfo.km) * Number(selectedTariffRate.per_km_rub)) + (doorToDoor ? configuredDoorToDoorPrice : 0))
      : null;

  const loadProfile = useCallback(async currentUser => {
    if (!currentUser || !supabase) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (error) throw error;
    setProfile(data || null);
    return data || null;
  }, []);

  const loadDriverProfile = useCallback(async () => {
    if (!user || !isDriver || !supabase) { setDriverProfile(null); return; }
    const { data, error } = await supabase.from('driver_profiles').select('*').eq('driver_id', user.id).maybeSingle();
    if (error) throw error;
    setDriverProfile(data || null);
    if (!data) { setDriverProfileDraft({}); return; }
    if (data) setDriverProfileDraft({
      display_name: data.display_name || '', phone: data.phone || '', experience: data.experience || '',
      vehicle_make: data.vehicle_make || '', vehicle_model: data.vehicle_model || '',
      vehicle_color: data.vehicle_color || '', vehicle_plate: data.vehicle_plate || '',
      vehicle_year: data.vehicle_year == null ? '' : String(data.vehicle_year),
    });
  }, [user, isDriver]);

  const loadOrders = useCallback(async () => {
    if (!user || !profile || !supabase) return;
    if (role === 'driver') {
      // A driver must see only trips assigned to them and offers explicitly dispatched to them.
      const [{ data: assigned, error: assignedError }, { data: offers, error: offersError }] = await Promise.all([
        supabase.from('orders').select('*').eq('driver_id', user.id).order('created_at', { ascending: false }).limit(40),
        supabase.from('order_offers').select('order_id, created_at').eq('driver_id', user.id).eq('status', 'pending'),
      ]);
      if (assignedError) throw assignedError;
      if (offersError) throw offersError;
      const pendingOffers = offers || [];
      setOfferTimes(Object.fromEntries(pendingOffers.map(item => [item.order_id, item.created_at])));
      const offeredIds = pendingOffers.map(item => item.order_id);
      let offeredOrders = [];
      if (offeredIds.length) {
        const { data, error } = await supabase.from('orders').select('*')
          .in('id', offeredIds).eq('status', 'new').is('driver_id', null);
        if (error) throw error;
        offeredOrders = data || [];
      }
      const unique = new Map();
      [...(assigned || []), ...offeredOrders].forEach(order => unique.set(order.id, order));
      setOrders([...unique.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 40));
      return;
    }
    if (isAdmin) {
      const { data, error } = await supabase.from('orders').select('*')
        .order('created_at', { ascending: false }).limit(40);
      if (error) throw error;
      setOrders(data || []);
      setCompletedOrdersToRate([]);
      return;
    }

    const [{ data: active, error: activeError }, { data: completed, error: completedError }, { data: closed, error: closedError }] = await Promise.all([
      supabase.from('orders').select('*').eq('passenger_id', user.id)
        .in('status', ACTIVE).order('created_at', { ascending: false }).limit(10),
      supabase.from('orders').select('*').eq('passenger_id', user.id)
        .eq('status', 'completed').order('completed_at', { ascending: false }).limit(30),
      supabase.from('orders').select('*').eq('passenger_id', user.id)
        .in('status', ['cancelled', 'declined']).order('created_at', { ascending: false }).limit(30),
    ]);
    if (activeError) throw activeError;
    if (completedError) throw completedError;
    if (closedError) throw closedError;
    setHistoryOrders([...(completed || []), ...(closed || [])]
      .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))
      .slice(0, 50));

    const completedIds = (completed || []).map(order => order.id);
    let ratedIds = [];
    if (completedIds.length) {
      const { data: existingRatings, error: ratingsError } = await supabase
        .from('order_ratings').select('order_id').in('order_id', completedIds);
      if (ratingsError) throw ratingsError;
      ratedIds = (existingRatings || []).map(item => item.order_id);
    }
    setOrders(active || []);
    setCompletedOrdersToRate((completed || []).filter(order => !ratedIds.includes(order.id)));
  }, [user, profile, role, isAdmin]);

  const loadNotifications = useCallback(async () => {
    if (!user || !supabase) return;
    const { data, error } = await supabase.from('notifications').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    setNotifications(data || []);
  }, [user]);

  const loadRatings = useCallback(async () => {
    if (!user || !profile || !supabase) return;
    let query = supabase.from('order_ratings')
      .select('id, order_id, passenger_id, driver_id, rating, comment, created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (role === 'driver') query = query.eq('driver_id', user.id);
    else if (!isAdmin) query = query.eq('passenger_id', user.id);
    const { data, error } = await query;
    if (error) throw error;
    setRatings(data || []);
  }, [user, profile, role, isAdmin]);

  const loadSupportTickets = useCallback(async () => {
    if (!user || !profile || !supabase) return;
    let query = supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(80);
    if (!isAdmin) query = query.eq('user_id', user.id);
    const { data, error } = await query;
    if (error) throw error;
    setSupportTickets(data || []);
  }, [user, profile, isAdmin]);

  const loadTariffRates = useCallback(async () => {
    if (!user || !supabase) return;
    const { data, error } = await supabase.from('tariff_rates').select('*').order('tariff_id');
    if (error) throw error;
    setTariffRates(data || []);
  }, [user]);

  const loadFixedPrices = useCallback(async () => {
    if (!user || !supabase) return;
    const { data, error } = await supabase.from('fixed_route_prices').select('*').order('display_name');
    if (error) throw error;
    setFixedPrices(data || []);
  }, [user]);

  const loadApplications = useCallback(async () => {
    if (!user || !profile || !supabase) return;
    let query = supabase.from('driver_applications').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('user_id', user.id);
    const { data, error } = await query;
    if (error) throw error;
    setApplications(data || []);
  }, [user, profile, isAdmin]);

  const loadSavedPlaces = useCallback(async () => {
    if (!user || isDriver || isAdmin || !supabase) return;
    const { data, error } = await supabase.from('saved_places').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (!error) setSavedPlaces(data || []);
  }, [user, isDriver, isAdmin]);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([loadOrders(), loadApplications(), loadSavedPlaces(), loadNotifications(), loadRatings(), loadTariffRates(), loadFixedPrices(), loadSupportTickets(), loadDriverProfile()]);
    } catch (e) { Alert.alert('Не удалось обновить данные', errorText(e)); }
  }, [loadOrders, loadApplications, loadSavedPlaces, loadNotifications, loadRatings, loadTariffRates, loadFixedPrices, loadSupportTickets, loadDriverProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  useEffect(() => {
    const handleAuthUrl = async url => {
      if (!supabase || !url || !url.startsWith('ladygo://')) return;
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) Alert.alert('Подтверждение почты', errorText(error));
          else Alert.alert('LadyGo', 'Почта подтверждена.');
        }
      } catch (e) { Alert.alert('Ссылка авторизации', errorText(e)); }
    };
    Linking.getInitialURL().then(handleAuthUrl);
    const urlListener = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url));
    return () => urlListener.remove();
  }, []);

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
      if (!nextSession) {
        if (authProfileTimer.current) clearTimeout(authProfileTimer.current);
        authProfileTimer.current = null;
        setProfile(null);
        setOrders([]);
        setHistoryOrders([]);
      } else {
        // Defer profile queries until the auth callback releases Supabase's internal auth lock.
        if (authProfileTimer.current) clearTimeout(authProfileTimer.current);
        authProfileTimer.current = setTimeout(() => {
          authProfileTimer.current = null;
          loadProfile(nextSession.user).catch(e => Alert.alert('Профиль', errorText(e)));
        }, 0);
      }
    });
    return () => {
      mounted = false;
      if (authProfileTimer.current) clearTimeout(authProfileTimer.current);
      authProfileTimer.current = null;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => { if (user && profile) refreshAll(); }, [user, profile, refreshAll]);
  useEffect(() => {
    setFixedPriceDraft(Object.fromEntries(fixedPrices.map(item => [item.route_key, String(item.price_rub ?? '')])));
  }, [fixedPrices]);
  useEffect(() => {
    setRateDraft(Object.fromEntries(tariffRates.map(rate => [rate.tariff_id, {
      base_fare_rub: String(rate.base_fare_rub ?? ''),
      per_km_rub: String(rate.per_km_rub ?? ''),
      minimum_fare_rub: String(rate.minimum_fare_rub ?? ''),
    }])));
  }, [tariffRates]);
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (isDriver) setMode('driver'); else if (isAdmin) setMode('admin'); else setMode('passenger'); }, [isDriver, isAdmin]);

  const registerDriverPush = useCallback(async () => {
    if (!user || !supabase || !Device.isDevice) return;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('driver-orders', {
          name: 'Заказы LadyGo', importance: Notifications.AndroidImportance.MAX,
          sound: 'default', vibrationPattern: [0, 250, 150, 250],
        });
        await Notifications.setNotificationChannelAsync('trip-updates', {
          name: 'Статусы поездок', importance: Notifications.AndroidImportance.HIGH,
          sound: 'default', vibrationPattern: [0, 180, 120, 180],
        });
      }
      const permission = await Notifications.getPermissionsAsync();
      let status = permission.status;
      if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') return;
      const projectId = '95ac82ec-010d-4770-9aba-9f52878e1b3b';
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const now = new Date().toISOString();
      const { error: userTokenError } = await supabase.from('user_push_tokens').upsert({
        user_id: user.id, expo_push_token: token, device_platform: platform, updated_at: now,
      }, { onConflict: 'user_id,expo_push_token' });
      if (userTokenError) console.warn('User push token registration:', userTokenError.message);
      if (isDriver) {
        const { error } = await supabase.from('driver_push_tokens').upsert({
          driver_id: user.id, expo_push_token: token, device_platform: platform, updated_at: now,
        }, { onConflict: 'driver_id,expo_push_token' });
        if (error) console.warn('Driver push token registration:', error.message);
      }
    } catch (e) { console.warn('Push registration:', e?.message || e); }
  }, [isDriver, user]);

  useEffect(() => { registerDriverPush(); }, [registerDriverPush]);
  useEffect(() => {
    const openFromPush = response => {
      const data = response?.notification?.request?.content?.data || {};
      if (!data.orderId) return;
      if (isDriver) {
        setMode('driver');
        setTab('ride');
      } else if (!isAdmin) {
        setMode('passenger');
        setTab('ride');
      }
      loadOrders().catch(() => {});
    };
    const listener = Notifications.addNotificationResponseReceivedListener(openFromPush);
    Notifications.getLastNotificationResponseAsync().then(openFromPush).catch(() => {});
    return () => listener.remove();
  }, [isDriver, isAdmin, loadOrders]);


  useEffect(() => {
    if (!isDriver || !user) return;
    supabase.from('driver_presence').select('is_online').eq('driver_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setDriverOnline(Boolean(data.is_online)); });
  }, [isDriver, user]);

  useEffect(() => {
    if (!isDriver || !user || !driverOnline) {
      if (locationWatch.current) { locationWatch.current.remove(); locationWatch.current = null; }
      return;
    }
    let active = true;
    (async () => {
      try {
        const foreground = await Location.getForegroundPermissionsAsync();
        if (foreground.status !== 'granted') throw new Error('Разреши LadyGo доступ к геолокации.');
        const background = await Location.getBackgroundPermissionsAsync();
        if (background.status !== 'granted') {
          const now = new Date().toISOString();
          await supabase.from('driver_presence').update({ is_online: false, updated_at: now }).eq('driver_id', user.id);
          setDriverOnline(false);
          setDriverGpsError('Постоянный доступ к геолокации отключён. Смена остановлена — включи разрешение «Всегда» и выйди на линию снова.');
          return;
        }
        if (!(await TaskManager.isAvailableAsync())) {
          const now = new Date().toISOString();
          await supabase.from('driver_presence').update({ is_online: false, updated_at: now }).eq('driver_id', user.id);
          setDriverOnline(false);
          throw new Error('Фоновая геолокация недоступна в этой версии приложения. Установи актуальную сборку LadyGo.');
        }
        const registered = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
        if (!registered) {
          await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 12000,
            distanceInterval: 20,
            deferredUpdatesInterval: 30000,
            deferredUpdatesDistance: 40,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            ...(Platform.OS === 'android' ? {
              foregroundService: {
                notificationTitle: 'LadyGo — водитель на линии',
                notificationBody: 'Геолокация обновляется, пока вы принимаете заказы.',
                notificationColor: C.pink,
                killServiceOnDestroy: false,
              },
            } : {}),
          });
        }
        const initial = await getPositionWithFallback();
        if (!active) return;
        const now = new Date().toISOString();
        const { latitude, longitude, heading } = initial.coords;
        const { error } = await supabase.from('driver_locations').upsert({
          driver_id: user.id, latitude, longitude, heading, updated_at: now,
        });
        if (error) throw error;
        setDriverGpsError('');
        setDriverGpsUpdatedAt(now);
        locationWatch.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 12000, distanceInterval: 15 },
          location => {
            if (!active || !location?.coords) return;
            const updatedAt = new Date(location.timestamp || Date.now()).toISOString();
            const { latitude: liveLat, longitude: liveLng, heading: liveHeading } = location.coords;
            setDriverGpsUpdatedAt(updatedAt);
            // Keep the live vehicle marker and dispatcher's freshness heartbeat current while the app is open.
            Promise.all([
              supabase.from('driver_locations').upsert({
                driver_id: user.id, latitude: liveLat, longitude: liveLng,
                heading: Number.isFinite(liveHeading) ? liveHeading : null, updated_at: updatedAt,
              }),
              supabase.from('driver_presence').update({ is_online: true, updated_at: updatedAt }).eq('driver_id', user.id),
            ]).then(([locationResult, presenceResult]) => {
              if (!active) return;
              if (locationResult.error || presenceResult.error) {
                setDriverGpsError(errorText(locationResult.error || presenceResult.error));
              } else {
                setDriverGpsError('');
              }
            }).catch(error => { if (active) setDriverGpsError(errorText(error)); });
          },
          reason => { if (active) setDriverGpsError(errorText(reason)); }
        );
      } catch (e) {
        if (active) {
          setDriverGpsError(errorText(e));
          await supabase.from('driver_presence').update({
            is_online: false, updated_at: new Date().toISOString(),
          }).eq('driver_id', user.id);
          setDriverOnline(false);
          Alert.alert('Геолокация водителя', errorText(e));
        }
      }
    })();
    return () => {
      active = false;
      if (locationWatch.current) { locationWatch.current.remove(); locationWatch.current = null; }
    };
  }, [isDriver, user, driverOnline]);

  useEffect(() => {
    if (mode !== 'passenger' || !activeOrder?.driver_id || !['accepted', 'arrived', 'in_progress'].includes(activeOrder.status)) {
      setAssignedDriver(null);
      return;
    }
    let alive = true;
    const driverId = activeOrder.driver_id;
    supabase.rpc('ladygo_get_assigned_driver_contact', { p_order_id: activeOrder.id })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) throw error;
        const contact = Array.isArray(data) ? data[0] : data;
        setAssignedDriver(contact ? {
          name: contact.full_name || 'Водитель LadyGo', experience: contact.experience || '', phone: contact.phone || null,
          avatarUrl: contact.avatar_url || null, vehicleMake: contact.vehicle_make || '', vehicleModel: contact.vehicle_model || '',
          vehicleColor: contact.vehicle_color || '', vehiclePlate: contact.vehicle_plate || '', vehicleYear: contact.vehicle_year || '',
          vehiclePhotoUrl: contact.vehicle_photo_url || null, averageRating: contact.average_rating, ratingCount: Number(contact.rating_count || 0),
        } : null);
      }).catch(() => { if (alive) setAssignedDriver(null); });
    return () => { alive = false; };
  }, [mode, activeOrder?.id, activeOrder?.driver_id, activeOrder?.status]);

  useEffect(() => {
    if (mode !== 'passenger' || !activeOrder?.driver_id) { setDriverLocation(null); return; }
    let alive = true;
    const driverId = activeOrder.driver_id;
    supabase.from('driver_locations').select('*').eq('driver_id', driverId).maybeSingle()
      .then(({ data }) => { if (alive && data) setDriverLocation({ latitude: data.latitude, longitude: data.longitude, updated_at: data.updated_at }); });
    const channel = supabase.channel('ladygo-driver-location-' + driverId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: 'driver_id=eq.' + driverId }, payload => {
        const row = payload.new;
        if (alive && row?.latitude != null && row?.longitude != null) setDriverLocation({ latitude: row.latitude, longitude: row.longitude, updated_at: row.updated_at });
      }).subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [mode, activeOrder?.driver_id]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('ladygo-applications-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_applications', filter: 'user_id=eq.' + user.id }, async () => {
        await loadApplications();
        await loadProfile(user);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadApplications, loadProfile]);

  useEffect(() => {
    if (!isDriver || !user) return;
    const channel = supabase.channel('ladygo-driver-profile-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_profiles', filter: 'driver_id=eq.' + user.id }, () => loadDriverProfile().catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isDriver, user, loadDriverProfile]);

  useEffect(() => {
    if (!isDriver || !user) return;
    const channel = supabase.channel('ladygo-offers-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_offers', filter: 'driver_id=eq.' + user.id }, () => loadOrders().catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isDriver, user, loadOrders]);
  useEffect(() => {
    if (!user || !supabase) return;
    const channel = supabase.channel('ladygo-orders-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders().catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadOrders]);

  useEffect(() => {
    if (!user || !supabase) return;
    const channel = supabase.channel('ladygo-notifications-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + user.id }, () => loadNotifications().catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadNotifications]);

  const markNotificationRead = async notification => {
    if (notification.read_at) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from('notifications').update({ read_at: readAt })
      .eq('id', notification.id).eq('user_id', user.id);
    if (error) return Alert.alert('Уведомления', errorText(error));
    setNotifications(current => current.map(item => item.id === notification.id ? { ...item, read_at: readAt } : item));
  };

  const signIn = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      Alert.alert('Заполни поля', 'Укажи почту и пароль.');
      return;
    }
    if (!supabase) {
      Alert.alert('Авторизация', 'Сервер не настроен. Попробуй обновить приложение позже.');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const result = authMode === 'signup'
        ? await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: { emailRedirectTo: 'ladygo://auth/callback' },
          })
        : await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (result.error) {
        Alert.alert('Авторизация', errorText(result.error));
        return;
      }
      if (authMode === 'signup' && !result.data.session) {
        setOtpSent(true);
        setOtpCode('');
        Alert.alert('Проверь почту', 'Введи шестизначный код из письма, чтобы подтвердить аккаунт.');
      }
    } catch (error) {
      Alert.alert('Не удалось войти', errorText(error));
    } finally {
      setBusy(false);
    }
  };


  const verifySignupOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const token = otpCode.replace(/\D/g, '').slice(0, 6);
    if (!cleanEmail || token.length !== 6) {
      Alert.alert('Проверь код', 'Введи шестизначный код из письма.');
      return;
    }
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token,
        type: 'signup',
      });
      if (error) {
        Alert.alert('Код не подошёл', errorText(error));
        return;
      }
      setOtpSent(false);
      setOtpCode('');
    } catch (error) {
      Alert.alert('Не удалось подтвердить почту', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const resendSignupEmail = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Укажи почту', 'Введи адрес электронной почты, на который регистрировался.');
      return;
    }
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: { emailRedirectTo: 'ladygo://auth/callback' },
      });
      if (error) {
        Alert.alert('Не удалось отправить письмо', errorText(error));
      } else {
        setOtpSent(true);
        Alert.alert('Запрос отправлен', 'Если аккаунт ещё не подтверждён, проверь письмо с шестизначным кодом.');
      }
    } catch (error) {
      Alert.alert('Ошибка отправки', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const getCurrentLocation = async () => {
    if (locationBusy) return;
    setLocationBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        const message = permission.canAskAgain
          ? 'Разреши LadyGo доступ к местоположению при использовании приложения.'
          : 'Доступ запрещён. Открой настройки Android → Приложения → LadyGo → Разрешения → Местоположение.';
        throw new Error(message);
      }
      const loc = await getPositionWithFallback();
      const point = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setCoords(point);
      mapRef.current?.animateToRegion({ ...point, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 650);
      try {
        const addresses = await Location.reverseGeocodeAsync(point);
        const a = addresses?.[0];
        const address = [a?.street, a?.streetNumber, a?.district, a?.city].filter(Boolean).join(', ');
        setPickup(address || 'Моё местоположение');
      } catch (_) {
        setPickup('Моё местоположение');
      }
    } catch (e) {
      Alert.alert('Не удалось определить местоположение', errorText(e));
    } finally {
      setLocationBusy(false);
    }
  };

  const buildRoute = async () => {
    if (!pickup.trim() || !destination.trim()) return Alert.alert('Маршрут', 'Укажи адрес подачи и назначения.');
    setLocationBusy(true);
    try {
      const addresses = [pickup.trim(), ...stopsText.split(/\n+/).map(x => x.trim()).filter(Boolean), destination.trim()];
      if (addresses.length > 22) throw new Error('Можно добавить не больше 20 промежуточных точек.');
      const points = [];
      for (let i = 0; i < addresses.length; i++) {
        let result;
        if (i === 0 && coords) result = coords;
        else if (i === addresses.length - 1 && destinationCoords) result = destinationCoords;
        else result = (await Location.geocodeAsync(addresses[i]))[0];
        if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
          throw new Error('Не удалось найти адрес: ' + addresses[i]);
        }
        points.push({ latitude: result.latitude, longitude: result.longitude });
      }
      const start = points[0], end = points[points.length - 1];
      const coordinates = points.map(p => p.longitude + ',' + p.latitude).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Сервис маршрутов временно недоступен.');
      const json = await response.json();
      const r = json.routes?.[0];
      if (!r || !r.geometry?.coordinates?.length) throw new Error('Не удалось построить автомобильный маршрут по этим адресам.');
      setCoords(start); setDestinationCoords(end); setStopCoords(points.slice(1, -1));
      setRoute(r.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })));
      setRouteInfo({ km: (r.distance / 1000).toFixed(1), minutes: Math.max(1, Math.round(r.duration / 60)) });
    } catch (e) {
      setRoute([]); setRouteInfo(null); setStopCoords([]);
      Alert.alert('Не удалось построить маршрут', errorText(e));
    } finally {
      setLocationBusy(false);
    }
  };

  const chooseProfilePhoto = async (setter, aspect = [1, 1]) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.78 });
      if (!result.canceled && result.assets?.[0]?.uri) setter(result.assets[0].uri);
    } catch (error) { Alert.alert('Фотография', errorText(error)); }
  };

  const uploadDriverPhoto = async (uri, kind) => {
    if (!uri || !user) return null;
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Не удалось прочитать выбранную фотографию.');
    const file = await response.arrayBuffer();
    const objectPath = user.id + '/' + kind + '-' + Date.now() + '.jpg';
    const { error } = await supabase.storage.from('ladygo-driver-media').upload(objectPath, file, {
      contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from('ladygo-driver-media').getPublicUrl(objectPath).data.publicUrl;
  };

  const repeatOrder = order => {
    if (!order) return;
    setPickup(order.pickup_address || '');
    setDestination(order.destination_address || '');
    setServiceType(order.service_type === 'courier' ? 'courier' : 'ride');
    setDoorToDoor(Boolean(order.door_to_door));
    setStopsText(Array.isArray(order.stops) ? order.stops.map(stop => stop.address).filter(Boolean).join('\n') : '');
    setTariff(TARIFFS.some(item => item.id === order.tariff_id) ? order.tariff_id : 'economy');
    setPaymentMethod(order.payment_method || 'cash');
    setPhone('');
    setComment('');
    setCoords(null);
    setDestinationCoords(null);
    setStopCoords([]);
    setRoute([]);
    setRouteInfo(null);
    setMode('passenger');
    setTab('ride');
  };

  const savePlace = async () => {
    if (!savedLabel.trim() || !savedAddress.trim()) return Alert.alert('Сохранённый адрес', 'Укажи название и адрес.');
    const { error } = await supabase.from('saved_places').insert({ user_id: user.id, label: savedLabel.trim(), address: savedAddress.trim() });
    if (error) return Alert.alert('Не удалось сохранить адрес', errorText(error));
    setSavedAddress(''); await loadSavedPlaces();
  };

  const createOrder = async () => {
    if (!pickup.trim() || !destination.trim()) return Alert.alert('Маршрут не заполнен', 'Укажи адрес подачи и назначения.');
    if (activeOrder) return Alert.alert('У тебя уже есть активный заказ', 'Заверши или отмени текущую поездку перед новым заказом.');
    if (serviceType === 'ride' && tariff === 'child' && !childAccompanied) {
      return Alert.alert('Поездка с ребёнком', 'Ребёнок должен ехать только в сопровождении совершеннолетнего родителя или законного представителя. Самостоятельная перевозка детей в LadyGo не поддерживается.');
    }
    setBusy(true);
    try {
      let start = coords, end = destinationCoords;
      if (!start) { const x = (await Location.geocodeAsync(pickup))[0]; if (x) start = { latitude: x.latitude, longitude: x.longitude }; }
      if (!end) { const x = (await Location.geocodeAsync(destination))[0]; if (x) end = { latitude: x.latitude, longitude: x.longitude }; }
      const stopAddresses = stopsText.split(/\n+/).map(x => x.trim()).filter(Boolean);
      if (stopAddresses.length > 20) throw new Error('Можно добавить не больше 20 промежуточных точек.');
      const structuredStops = [];
      for (let i = 0; i < stopAddresses.length; i++) {
        let point = stopCoords.length === stopAddresses.length ? stopCoords[i] : null;
        if (!point) {
          const found = (await Location.geocodeAsync(stopAddresses[i]))[0];
          if (!found) throw new Error('Не удалось найти промежуточную точку: ' + stopAddresses[i]);
          point = { latitude: found.latitude, longitude: found.longitude };
        }
        structuredStops.push({ sequence: i + 1, address: stopAddresses[i], latitude: point.latitude, longitude: point.longitude });
      }
      const selected = TARIFFS.find(t => t.id === tariff);
      const scheduleText = requestedFor.trim();
      let scheduledAt = null;
      if (scheduleText && !/^как можно скорее$|^сейчас$/i.test(scheduleText)) {
        const match = scheduleText.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
        if (!match) throw new Error('Для предварительного заказа укажи дату и время в формате ДД.ММ.ГГГГ ЧЧ:ММ. Например: 25.12.2026 14:30.');
        const [, day, month, year, hour, minute] = match;
        const localDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
        if (localDate.getFullYear() !== Number(year) || localDate.getMonth() !== Number(month) - 1 ||
            localDate.getDate() !== Number(day) || localDate.getHours() !== Number(hour) || localDate.getMinutes() !== Number(minute)) {
          throw new Error('Проверь дату и время предварительного заказа.');
        }
        if (localDate.getTime() < Date.now() + 5 * 60 * 1000) throw new Error('Предварительный заказ должен быть минимум через 5 минут.');
        if (localDate.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) throw new Error('Заказ можно запланировать не более чем на 30 дней вперёд.');
        scheduledAt = localDate.toISOString();
      }
      const payload = {
        passenger_id: user.id, pickup_address: pickup.trim(), destination_address: destination.trim(),
        requested_for: scheduleText || 'Как можно скорее', ...(scheduledAt ? { scheduled_at: scheduledAt } : {}), passenger_phone: phone.trim() || null,
        notes: [serviceType === 'courier' ? 'Тип: курьерская доставка' : 'Тип: поездка', doorToDoor ? 'От двери до двери' : '', comment.trim(), 'Тариф: ' + (selected?.name || 'Эконом'), routeInfo ? `Маршрут: ${routeInfo.km} км, около ${routeInfo.minutes} мин` : ''].filter(Boolean).join(' | '),
        stops: structuredStops,
        tariff_id: tariff,
        service_type: serviceType,
        door_to_door: doorToDoor,
        estimated_price_rub: estimatedPrice == null ? null : Math.round(estimatedPrice),
        payment_method: paymentMethod,
        status: 'new',
        ...(start ? { pickup_lat: start.latitude, pickup_lng: start.longitude } : {}),
        ...(end ? { destination_lat: end.latitude, destination_lng: end.longitude } : {}),
      };
      const { error } = await supabase.from('orders').insert(payload);
      if (error) throw error;
      Alert.alert('Заказ отправлен', estimatedPrice == null ? 'Ищем водителя. Стоимость маршрута вне списка будет рассчитана отдельно.' : 'Ищем водителя. Фиксированная стоимость: ' + Math.round(estimatedPrice) + ' ₽.');
      setTab('ride');
      await loadOrders();
    } catch (e) { Alert.alert('Не удалось заказать поездку', errorText(e)); }
    setBusy(false);
  };

  const submitSupportTicket = async () => {
    if (supportSubject.trim().length < 3 || supportMessage.trim().length < 5) {
      return Alert.alert('Обращение в поддержку', 'Укажи тему и опиши вопрос подробнее.');
    }
    setBusy(true);
    const { error } = await supabase.from('support_tickets').insert({
      user_id: user.id,
      order_id: activeOrder?.id || null,
      subject: supportSubject.trim(),
      message: supportMessage.trim(),
    });
    setBusy(false);
    if (error) return Alert.alert('Не удалось отправить обращение', errorText(error));
    setSupportSubject('');
    setSupportMessage('');
    await loadSupportTickets();
    Alert.alert('Обращение отправлено', 'Ответ появится в этом разделе.');
  };

  const replyToSupportTicket = async ticket => {
    const reply = (supportReplyDraft[ticket.id] || '').trim();
    if (reply.length < 2) return Alert.alert('Ответ поддержки', 'Напиши ответ перед отправкой.');
    setBusy(true);
    const { error } = await supabase.from('support_tickets').update({
      admin_reply: reply,
      status: 'resolved',
      updated_at: new Date().toISOString(),
    }).eq('id', ticket.id);
    setBusy(false);
    if (error) return Alert.alert('Не удалось отправить ответ', errorText(error));
    setSupportReplyDraft(p => ({ ...p, [ticket.id]: '' }));
    await loadSupportTickets();
  };

  const saveFixedPrices = async () => {
    const now = new Date().toISOString();
    const rows = fixedPrices.map(item => {
      const price = Number(String(fixedPriceDraft[item.route_key] ?? item.price_rub).replace(',', '.'));
      if (!Number.isFinite(price) || price <= 0) throw new Error('Цена маршрута должна быть числом больше нуля.');
      return { route_key: item.route_key, display_name: item.display_name, aliases: item.aliases || [], price_rub: price, is_active: item.is_active !== false, updated_at: now };
    });
    setBusy(true);
    const { error } = await supabase.from('fixed_route_prices').upsert(rows, { onConflict: 'route_key' });
    setBusy(false);
    if (error) return Alert.alert('Фиксированные цены', errorText(error));
    await loadFixedPrices();
    Alert.alert('Цены сохранены', 'Новые фиксированные цены применены к новым заказам.');
  };

  const saveTariffRates = async () => {
    const now = new Date().toISOString();
    const rows = TARIFFS.map(item => {
      const draft = rateDraft[item.id] || {};
      const base = Number(String(draft.base_fare_rub ?? '0').replace(',', '.'));
      const perKm = Number(String(draft.per_km_rub ?? '0').replace(',', '.'));
      const minimum = Number(String(draft.minimum_fare_rub ?? '0').replace(',', '.'));
      if (![base, perKm, minimum].every(value => Number.isFinite(value) && value >= 0)) {
        throw new Error('В тарифах должны быть неотрицательные числовые значения.');
      }
      return {
        tariff_id: item.id,
        base_fare_rub: base,
        per_km_rub: perKm,
        minimum_fare_rub: minimum,
        is_active: base > 0 || perKm > 0 || minimum > 0,
        updated_at: now,
      };
    });
    setBusy(true);
    const { error } = await supabase.from('tariff_rates').upsert(rows, { onConflict: 'tariff_id' });
    setBusy(false);
    if (error) return Alert.alert('Тарифы', errorText(error));
    await loadTariffRates();
    Alert.alert('Тарифы сохранены', 'Новые цены будут использоваться в оценке стоимости поездки.');
  };

  const submitRating = async order => {
    const value = Number(ratingDraft[order.id] || 0);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return Alert.alert('Оценка поездки', 'Выбери оценку от 1 до 5 звёзд.');
    }
    setBusy(true);
    const { error } = await supabase.from('order_ratings').insert({
      order_id: order.id,
      passenger_id: user.id,
      driver_id: order.driver_id,
      rating: value,
      comment: (ratingComments[order.id] || '').trim() || null,
    });
    setBusy(false);
    if (error) return Alert.alert('Не удалось отправить оценку', errorText(error));
    await Promise.all([loadRatings(), loadOrders()]);
    Alert.alert('Спасибо за оценку!', 'Твой отзыв сохранён.');
  };

  const updateOrder = async (order, status) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('ladygo_update_trip_status', { p_order_id: order.id, p_status: status });
    setBusy(false);
    if (error) return Alert.alert('Ошибка заказа', errorText(error));
    if (!data) return Alert.alert('Статус не изменён', 'Обнови список заказов.');
    await loadOrders();
  };

  const setDriverAvailability = async nextOnline => {
    if (!nextOnline && orders.some(order => order.driver_id === user.id && ['accepted', 'arrived', 'in_progress'].includes(order.status))) {
      return Alert.alert('Поездка ещё не завершена', 'Сначала заверши активную поездку, затем можно закончить смену.');
    }
    setBusy(true);
    try {
      if (nextOnline) {
        if (!(await TaskManager.isAvailableAsync())) throw new Error('Фоновая геолокация недоступна в Expo Go. Нужна установленная Android-сборка LadyGo.');
        const foreground = await Location.requestForegroundPermissionsAsync();
        if (foreground.status !== 'granted') throw new Error('Без доступа к геолокации нельзя выйти на линию.');
        const background = await Location.requestBackgroundPermissionsAsync();
        if (background.status !== 'granted') throw new Error('Не выдан постоянный доступ к местоположению. В настройках Android выбери «Разрешить всегда», чтобы получать заказы при свёрнутом приложении.');
        const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
        if (!alreadyStarted) {
          await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 12000,
            distanceInterval: 20,
            deferredUpdatesInterval: 30000,
            deferredUpdatesDistance: 40,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            ...(Platform.OS === 'android' ? {
              foregroundService: {
                notificationTitle: 'LadyGo — водитель на линии',
                notificationBody: 'Геолокация обновляется, пока вы принимаете заказы.',
                notificationColor: C.pink,
                killServiceOnDestroy: false,
              },
            } : {}),
          });
        }
        const initial = await getPositionWithFallback();
        const now = new Date().toISOString();
        const { latitude, longitude, heading } = initial.coords;
        const { error: locationError } = await supabase.from('driver_locations').upsert({
          driver_id: user.id, latitude, longitude, heading, updated_at: now,
        });
        if (locationError) throw locationError;
        const { error } = await supabase.from('driver_presence').upsert({ driver_id: user.id, is_online: true, updated_at: now });
        if (error) throw error;
        setDriverGpsError('');
        setDriverGpsUpdatedAt(now);
        setDriverOnline(true);
      } else {
        const now = new Date().toISOString();
        const { error } = await supabase.from('driver_presence').upsert({ driver_id: user.id, is_online: false, updated_at: now });
        if (error) throw error;
        setDriverOnline(false);
        if (locationWatch.current) { locationWatch.current.remove(); locationWatch.current = null; }
        const registered = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
        if (registered) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
      }
    } catch (e) {
      if (nextOnline) {
        const registered = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
        if (registered) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => {});
      }
      Alert.alert('Статус водителя', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const acceptOfferedOrder = async (order) => {
    const fixed = order.estimated_price_rub == null ? null : Number(order.estimated_price_rub);
    const value = fixed != null ? fixed : Number(String(fare[order.id] || '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0 || value > 1000000) return Alert.alert('Стоимость', 'Для индивидуального маршрута введи стоимость от 1 до 1 000 000 ₽.');
    setBusy(true);
    const { error } = await supabase.rpc('ladygo_accept_order', { p_order_id: order.id, p_price: value });
    setBusy(false);
    if (error) return Alert.alert('Не удалось принять заказ', errorText(error));
    setFare(p => ({ ...p, [order.id]: '' }));
    await loadOrders();
    Alert.alert('Заказ принят', 'Стоимость: ' + value + ' ₽');
  };

  const skipOfferedOrder = async order => {
    setBusy(true);
    const { data, error } = await supabase.rpc('ladygo_skip_order_offer', { p_order_id: order.id });
    setBusy(false);
    if (error) Alert.alert('Не удалось пропустить заказ', errorText(error));
    else { await loadOrders(); }
  };

  const cancelOrder = order => Alert.alert('Отменить поездку?', 'Отмена доступна до начала поездки. После её начала свяжись с поддержкой.', [
    { text: 'Оставить', style: 'cancel' },
    { text: 'Подтвердить отмену', style: 'destructive', onPress: async () => {
      setBusy(true);
      const { error } = await supabase.rpc('ladygo_cancel_active_order', {
        p_order_id: order.id,
        p_reason: isDriver ? 'Отмена водителем' : 'Отмена пассажиром',
      });
      setBusy(false);
      if (error) Alert.alert('Не удалось отменить', errorText(error));
      else { await loadOrders(); Alert.alert('Поездка отменена', 'Участники поездки получат уведомление.'); }
    } },
  ]);

  const submitApplication = async () => {
    if (!applicationName.trim() || !applicationPhone.trim()) return Alert.alert('Заполни данные', 'Нужны имя и телефон для связи.');
    if (!applicationVehicleMake.trim() || !applicationVehicleModel.trim() || !applicationVehiclePlate.trim()) {
      return Alert.alert('Данные автомобиля', 'Укажи марку, модель и государственный номер автомобиля.');
    }
    setBusy(true);
    try {
      const [avatarUrl, vehiclePhotoUrl] = await Promise.all([
        applicationAvatarUri ? uploadDriverPhoto(applicationAvatarUri, 'avatar') : Promise.resolve(null),
        applicationVehiclePhotoUri ? uploadDriverPhoto(applicationVehiclePhotoUri, 'vehicle') : Promise.resolve(null),
      ]);
      const year = applicationVehicleYear.trim() ? Number(applicationVehicleYear) : null;
      if (year != null && (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1)) throw new Error('Проверь год выпуска автомобиля.');
      const { error } = await supabase.from('driver_applications').insert({
        user_id: user.id, full_name: applicationName.trim(), phone: applicationPhone.trim(),
        experience: applicationNote.trim() || null,
        vehicle_make: applicationVehicleMake.trim(), vehicle_model: applicationVehicleModel.trim(),
        vehicle_color: applicationVehicleColor.trim() || null,
        vehicle_plate: applicationVehiclePlate.trim().toUpperCase(), vehicle_year: year,
        avatar_url: avatarUrl, vehicle_photo_url: vehiclePhotoUrl,
        license_info: 'Документы будут проверены администратором лично.', status: 'pending',
      });
      if (error) throw error;
      Alert.alert('Заявка отправлена', 'Администратор рассмотрит данные и свяжется с тобой.');
      setApplicationAvatarUri(null); setApplicationVehiclePhotoUri(null);
      await loadApplications();
    } catch (error) { Alert.alert('Заявка', errorText(error)); }
    finally { setBusy(false); }
  };

  const saveDriverProfile = async () => {
    if (!user) return;
    const draft = driverProfileDraft || {};
    if (!String(draft.display_name || '').trim() || !String(draft.phone || '').trim()) return Alert.alert('Профиль водителя', 'Укажи имя и номер телефона.');
    setBusy(true);
    try {
      const [avatarUrl, vehiclePhotoUrl] = await Promise.all([
        driverAvatarUri ? uploadDriverPhoto(driverAvatarUri, 'avatar') : Promise.resolve(driverProfile?.avatar_url || null),
        driverVehiclePhotoUri ? uploadDriverPhoto(driverVehiclePhotoUri, 'vehicle') : Promise.resolve(driverProfile?.vehicle_photo_url || null),
      ]);
      const year = String(draft.vehicle_year || '').trim() ? Number(draft.vehicle_year) : null;
      if (year != null && (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1)) throw new Error('Проверь год выпуска автомобиля.');
      const payload = {
        driver_id: user.id, display_name: String(draft.display_name).trim(), phone: String(draft.phone).trim(),
        experience: String(draft.experience || '').trim() || null,
        vehicle_make: String(draft.vehicle_make || '').trim() || null,
        vehicle_model: String(draft.vehicle_model || '').trim() || null,
        vehicle_color: String(draft.vehicle_color || '').trim() || null,
        vehicle_plate: String(draft.vehicle_plate || '').trim().toUpperCase() || null,
        vehicle_year: year, avatar_url: avatarUrl, vehicle_photo_url: vehiclePhotoUrl,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('driver_profiles').upsert(payload, { onConflict: 'driver_id' });
      if (error) throw error;
      setDriverAvatarUri(null); setDriverVehiclePhotoUri(null);
      await loadDriverProfile();
      Alert.alert('Профиль сохранён', 'Данные и фотографии обновлены.');
    } catch (error) { Alert.alert('Профиль водителя', errorText(error)); }
    finally { setBusy(false); }
  };

  const reviewApplication = async (app, approved) => {
    const submitReview = async () => {
      setBusy(true);
      try {
        const { error } = await supabase.from('driver_applications')
          .update({ status: approved ? 'approved' : 'rejected' }).eq('id', app.id);
        if (error) throw error;
        await loadApplications();
      } catch (e) { Alert.alert('Не удалось обработать заявку', errorText(e)); }
      finally { setBusy(false); }
    };
    if (!approved) return submitReview();
    Alert.alert(
      'Проверка водителя обязательна',
      'Одобрять заявку можно только после личной проверки ответственным совершеннолетним владельцем сервиса: личности водителя, действительности водительского удостоверения, документов автомобиля, страхования и соответствия местным требованиям. Фотографии в заявке сами по себе не подтверждают допуск.',
      [
        { text: 'Назад', style: 'cancel' },
        { text: 'Проверка проведена', onPress: submitReview },
      ],
    );
  };

  const resetPassword = async () => {
    if (!email.trim()) return Alert.alert('Восстановление пароля', 'Сначала введи свою почту.');
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: 'ladygo://auth/callback' });
    setBusy(false);
    if (error) Alert.alert('Не удалось отправить письмо', errorText(error));
    else Alert.alert('Письмо отправлено', 'Проверь почту и перейди по ссылке для восстановления пароля.');
  };

  const logout = async () => {
    if (isDriver && user && orders.some(order => order.driver_id === user.id && ['accepted', 'arrived', 'in_progress'].includes(order.status))) {
      return Alert.alert('Поездка ещё не завершена', 'Сначала заверши активную поездку, затем можно выйти из аккаунта.');
    }
    if (user) {
      try {
        const token = (await Notifications.getExpoPushTokenAsync({
          projectId: '95ac82ec-010d-4770-9aba-9f52878e1b3b',
        })).data;
        await Promise.all([
          supabase.from('user_push_tokens').delete().eq('user_id', user.id).eq('expo_push_token', token),
          supabase.from('driver_push_tokens').delete().eq('driver_id', user.id).eq('expo_push_token', token),
        ]);
      } catch (_) {}
    }
    if (isDriver && user) {
      await supabase.from('driver_presence').upsert({
        driver_id: user.id, is_online: false, updated_at: new Date().toISOString(),
      });
      const registered = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
      if (registered) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => {});
    }
    await supabase.auth.signOut();
  };

  if (booting) return <View style={s.center}><ActivityIndicator color={C.pink} size="large" /><Text style={s.muted}>Загружаем LadyGo…</Text></View>;
  if (!isConfigured) return <View style={s.center}><Text style={s.brand}>LadyGo</Text><Text style={s.heading}>Нужно подключить сервер</Text><Text style={s.muted}>Добавь EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY в переменные окружения Expo.</Text></View>;
  if (!session) return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content" backgroundColor={C.pale} /><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.auth}>
    <Text style={s.brand}>LadyGo</Text><Text style={s.tagline}>Поездки с заботой</Text>
    <Card><Text style={s.title}>{otpSent ? 'Подтверждение почты' : authMode === 'login' ? 'С возвращением' : 'Создать аккаунт'}</Text>
      <Input label="Электронная почта" value={email} onChangeText={setEmail} keyboardType="email-address" />
      {otpSent ? <>
        <Input label="Шестизначный код из письма" value={otpCode} onChangeText={value => setOtpCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="000000" />
        <Button title={busy ? 'Проверяем…' : 'Подтвердить код'} onPress={verifySignupOtp} disabled={busy || otpCode.length !== 6} />
        <Button title="Отправить код ещё раз" secondary onPress={resendSignupEmail} disabled={busy} />
        <Button title="Назад ко входу" secondary onPress={() => { setOtpSent(false); setOtpCode(''); setAuthMode('login'); }} />
      </> : <>
        <Input label="Пароль" value={password} onChangeText={setPassword} secureTextEntry />
        {authMode === 'login' && <TouchableOpacity onPress={resetPassword} disabled={busy}><Text style={{ color: C.pinkDark, fontWeight: '700', textAlign: 'right', paddingVertical: 8 }}>Забыли пароль?</Text></TouchableOpacity>}
        <Button title={busy ? 'Подождите…' : authMode === 'login' ? 'Войти' : 'Зарегистрироваться'} onPress={signIn} disabled={busy} />
        <Button title={authMode === 'login' ? 'Создать аккаунт' : 'У меня уже есть аккаунт'} secondary onPress={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setOtpCode(''); }} />
        {authMode === 'signup' && <TouchableOpacity onPress={resendSignupEmail} disabled={busy}><Text style={{ color: C.pinkDark, fontWeight: '700', textAlign: 'center', paddingVertical: 10 }}>{busy ? 'Подождите…' : 'Не пришло письмо? Отправить ещё раз'}</Text></TouchableOpacity>}
      </>}
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

    {mode === 'passenger' && tab === 'ride' && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.pink} />} >
      {activeOrder && <Card><View style={s.rowBetween}><Pill>{STATUS[activeOrder.status] || activeOrder.status}</Pill><Text style={s.price}>{money(activeOrder.price_rub)}</Text></View><Text style={s.address}>Откуда: {activeOrder.pickup_address}</Text><Text style={s.address}>Куда: {activeOrder.destination_address}</Text><TripProgress status={activeOrder.status} /><TripMap order={activeOrder} driverLocation={driverLocation} />{activeOrder.status === 'new' && <Text style={s.muted}>Ожидаем подтверждения водителя.</Text>}
        {['new','accepted','arrived'].includes(activeOrder.status) && <Button title={busy ? 'Отменяем…' : 'Отменить поездку'} danger secondary compact disabled={busy} onPress={() => cancelOrder(activeOrder)} />}
        <View style={s.row}>
          <View style={{ flex: 1 }}><Button title="Поделиться поездкой" secondary compact onPress={() => shareTripDetails(activeOrder)} /></View>
          <View style={{ flex: 1 }}><Button title="Экстренный вызов 112" danger secondary compact onPress={() => Alert.alert('Экстренная помощь', 'Если есть непосредственная угроза жизни или здоровью, позвони по номеру 112.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Позвонить 112', style: 'destructive', onPress: () => Linking.openURL('tel:112').catch(() => Alert.alert('Звонок', 'Не удалось открыть приложение телефона.')) }])} /></View>
        </View>{assignedDriver && <View style={{ gap: 9, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
        <View style={s.row}>
          {assignedDriver.avatarUrl ? <Image source={{ uri: assignedDriver.avatarUrl }} style={s.driverAvatar} /> : <View style={s.driverAvatarPlaceholder}><Text style={s.avatarText}>{assignedDriver.name.slice(0,1).toUpperCase()}</Text></View>}
          <View style={{ flex: 1, justifyContent: 'center', gap: 3 }}>
            <Text style={s.tariffName}>{assignedDriver.name}</Text>
            <Text style={s.muted}>{assignedDriver.averageRating == null ? 'Новый водитель' : '★ ' + assignedDriver.averageRating + ' · ' + assignedDriver.ratingCount + ' оценок'}</Text>
            {assignedDriver.experience ? <Text style={s.muted}>{assignedDriver.experience}</Text> : null}
          </View>
        </View>
        {(assignedDriver.vehicleMake || assignedDriver.vehicleModel) ? <View style={{ gap: 5 }}>
          {assignedDriver.vehiclePhotoUrl ? <Image source={{ uri: assignedDriver.vehiclePhotoUrl }} style={s.vehiclePhoto} resizeMode="cover" /> : null}
          <Text style={s.tariffName}>{[assignedDriver.vehicleMake, assignedDriver.vehicleModel, assignedDriver.vehicleYear].filter(Boolean).join(' ')}</Text>
          <Text style={s.muted}>{[assignedDriver.vehicleColor, assignedDriver.vehiclePlate].filter(Boolean).join(' · ')}</Text>
        </View> : null}
        {assignedDriver.phone ? <Button title="Позвонить водителю" secondary compact onPress={() => Linking.openURL('tel:' + assignedDriver.phone)} /> : null}
      </View>}<TripChat order={activeOrder} userId={user?.id} /></Card>}
      {completedOrdersToRate.map(order => <Card key={'rate-' + order.id}>
        <Text style={s.section}>Оцените завершённую поездку</Text>
        <Text style={s.address}>{order.pickup_address} → {order.destination_address}</Text>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          {[1, 2, 3, 4, 5].map(value => <TouchableOpacity key={value} onPress={() => setRatingDraft(p => ({ ...p, [order.id]: value }))}
            style={[s.savedChip, Number(ratingDraft[order.id]) === value && { borderWidth: 1, borderColor: C.pink, backgroundColor: C.pale }]}>
            <Text style={[s.savedChipText, { fontSize: 16 }]}>{value} ★</Text>
          </TouchableOpacity>)}
        </View>
        <Input label="Комментарий (необязательно)" value={ratingComments[order.id] || ''}
          onChangeText={value => setRatingComments(p => ({ ...p, [order.id]: value }))}
          placeholder="Расскажите о поездке" multiline />
        <Button title={busy ? 'Отправляем…' : 'Отправить оценку'} disabled={busy || !ratingDraft[order.id]}
          onPress={() => submitRating(order)} />
      </Card>)}
      <View style={s.mapWrap}>
        {Platform.OS === 'android' ? <LeafletMap height={245} points={[
          ...(coords ? [{ ...coords, label: 'Подача', color: C.pink }] : []),
          ...stopCoords.map((point, index) => ({ ...point, label: 'Остановка ' + (index + 1), color: '#D69A35' })),
          ...(destinationCoords ? [{ ...destinationCoords, label: 'Назначение', color: C.blue }] : []),
          ...(driverLocation ? [{ ...driverLocation, label: 'Автомобиль LadyGo', color: '#26865A' }] : []),
        ]} route={route} /> : <MapView ref={mapRef} mapType="none" style={s.map} region={driverLocation ? { ...driverLocation, latitudeDelta: 0.025, longitudeDelta: 0.025 } : mapRegion} showsUserLocation showsMyLocationButton={false}>
          <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />
          {coords && <Marker coordinate={coords} title="Подача" pinColor={C.pink} />}
          {stopCoords.map((point, index) => <Marker key={'stop-' + index} coordinate={point} title={'Остановка ' + (index + 1)} pinColor="#D69A35" />)}
          {destinationCoords && <Marker coordinate={destinationCoords} title="Назначение" pinColor={C.blue} />}
          {driverLocation && <Marker coordinate={driverLocation} title="Автомобиль LadyGo" pinColor="#26865A" />}
          {route.length > 1 && <Polyline coordinates={route} strokeColor={C.pink} strokeWidth={5} />}
        </MapView>}
        <Text style={[s.muted, { textAlign: 'center' }]}>© OpenStreetMap contributors</Text>
        <TouchableOpacity style={s.locButton} onPress={getCurrentLocation}><Text style={s.locText}>{locationBusy ? 'Определяем…' : '◎ Моё местоположение'}</Text></TouchableOpacity>
      </View>
      <Card>
        <Text style={s.title}>Куда едем?</Text>
        <Text style={s.label}>Тип заказа</Text>
        <View style={s.row}>
          <TouchableOpacity onPress={() => setServiceType('ride')} style={[s.savedChip, serviceType === 'ride' && { borderWidth: 1, borderColor: C.pink, backgroundColor: C.pale }]}>
            <Text style={s.savedChipText}>🚕 Поездка</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setServiceType('courier'); setTariff('economy'); setChildAccompanied(false); }} style={[s.savedChip, serviceType === 'courier' && { borderWidth: 1, borderColor: C.pink, backgroundColor: C.pale }]}>
            <Text style={s.savedChipText}>📦 Курьер — {configuredCourierPrice} ₽</Text>
          </TouchableOpacity>
        </View>
        <Input label="Откуда" value={pickup} onChangeText={v => { setPickup(v); setCoords(null); setStopCoords([]); setRoute([]); setRouteInfo(null); }} placeholder="Адрес подачи" />
        <Button title="Определить моё местоположение" secondary compact onPress={getCurrentLocation} />
        <Input label="Куда" value={destination} onChangeText={v => { setDestination(v); setDestinationCoords(null); setStopCoords([]); setRoute([]); setRouteInfo(null); }} placeholder="Адрес назначения" />
        <Input label="Промежуточные точки (по одной на строку)" value={stopsText} onChangeText={v => { setStopsText(v); setStopCoords([]); setRoute([]); setRouteInfo(null); }} multiline placeholder="Можно оставить пустым" />
        {serviceType === 'ride' && <TouchableOpacity onPress={() => setDoorToDoor(value => !value)} style={[s.row, { alignItems: 'center', paddingVertical: 8 }]}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: doorToDoor ? C.pink : C.muted, backgroundColor: doorToDoor ? C.pink : C.white, alignItems: 'center', justifyContent: 'center' }}>
            {doorToDoor ? <Text style={{ color: C.white, fontWeight: '900' }}>✓</Text> : null}
          </View>
          <Text style={[s.address, { flex: 1 }]}>От двери до двери (+{configuredDoorToDoorPrice} ₽)</Text>
        </TouchableOpacity>}
        <Input label="Когда подать машину" value={requestedFor} onChangeText={setRequestedFor} placeholder="Как можно скорее или ДД.ММ.ГГГГ ЧЧ:ММ" />
        <Text style={s.muted}>Для предварительного заказа введи дату и время, например 25.12.2026 14:30. Такие заказы автоматически отправляются водителям в назначенное время.</Text>
        {savedPlaces.length > 0 && <View style={{ gap: 6 }}><Text style={s.label}>Сохранённые адреса</Text><View style={s.row}>{savedPlaces.slice(0, 3).map(p => <TouchableOpacity key={p.id} style={s.savedChip} onPress={() => { setPickup(p.address); setCoords(null); setStopCoords([]); setRoute([]); setRouteInfo(null); }}><Text style={s.savedChipText}>{p.label}</Text></TouchableOpacity>)}</View></View>}
        <Button title="Построить маршрут" secondary compact onPress={buildRoute} />
        {routeInfo && <Text style={s.routeInfo}>{routeInfo.km} км · около {routeInfo.minutes} мин в пути</Text>}
        <View style={{ gap: 4, paddingTop: 7 }}>
          <Text style={s.routeInfo}>{estimatedPrice == null ? 'Маршрут вне фиксированного списка — стоимость рассчитаем отдельно' : (fixedFare != null ? 'Фиксированная стоимость: ' : 'Расчётная стоимость: ') + money(Math.round(estimatedPrice))}</Text>
          {serviceType === 'courier' && <Text style={s.muted}>Курьерская доставка — {configuredCourierPrice} ₽. Алкоголь и табачные изделия не принимаются.</Text>}
        </View>
      </Card>
      <Text style={s.section}>Выберите тариф</Text>
      {TARIFFS.map(t => <TouchableOpacity key={t.id} onPress={() => { setTariff(t.id); if (t.id !== 'child') setChildAccompanied(false); }} style={[s.tariff, tariff === t.id && s.tariffSelected]}>
        <View style={s.tariffIcon}><Text style={s.tariffEmoji}>{t.id === 'child' ? '♡' : t.id === 'comfort' ? '✦' : '↗'}</Text></View>
        <View style={{ flex: 1 }}><Text style={s.tariffName}>{t.name}</Text><Text style={s.muted}>{t.detail}</Text></View>
        <View style={[s.radio, tariff === t.id && s.radioOn]} />
      </TouchableOpacity>)}
      {tariff === 'child' && <Card style={{ borderColor: C.pink }}>
        <Text style={s.section}>Важное условие поездки с ребёнком</Text>
        <Text style={s.muted}>Ребёнок должен ехать вместе с совершеннолетним родителем или законным представителем. LadyGo не поддерживает самостоятельную перевозку несовершеннолетних. Перед любым реальным запуском взрослый владелец сервиса должен отдельно проверить документы, согласие, требования к детским удерживающим устройствам и страхование.</Text>
        <TouchableOpacity onPress={() => setChildAccompanied(value => !value)} style={[s.row, { alignItems: 'center', paddingVertical: 6 }]}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: childAccompanied ? C.pink : C.muted, backgroundColor: childAccompanied ? C.pink : C.white, alignItems: 'center', justifyContent: 'center' }}>
            {childAccompanied ? <Text style={{ color: C.white, fontWeight: '900' }}>✓</Text> : null}
          </View>
          <Text style={[s.address, { flex: 1 }]}>Подтверждаю, что ребёнок будет с совершеннолетним родителем или законным представителем.</Text>
        </TouchableOpacity>
      </Card>}
      <Text style={s.section}>Способ оплаты</Text>
      <View style={s.row}>
        <TouchableOpacity onPress={() => setPaymentMethod('cash')} style={[s.savedChip, paymentMethod === 'cash' && { borderWidth: 1, borderColor: C.pink }]}>
          <Text style={s.savedChipText}>Наличными</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPaymentMethod('transfer_to_driver')} style={[s.savedChip, paymentMethod === 'transfer_to_driver' && { borderWidth: 1, borderColor: C.pink }]}>
          <Text style={s.savedChipText}>Перевод водителю</Text>
        </TouchableOpacity>
      </View>
      <Card><Text style={s.section}>Пожелания к поездке</Text>
        <Input label="Телефон для связи (необязательно)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+7…" />
        <Input label="Комментарий водителю" value={comment} onChangeText={setComment} multiline placeholder="Например, подъехать к главному входу" />
        <Button title={busy ? 'Отправляем…' : 'Заказать поездку'} onPress={createOrder} disabled={busy} />
        <Text style={s.disclaimer}>{estimatedPrice == null ? 'Для маршрута вне списка стоимость согласуется отдельно до принятия заказа.' : 'Цена показана по тарифу LadyGo. Оплата — наличными или переводом водителю.'}</Text>
      </Card>
    </ScrollView>}

    {mode === 'driver' && <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.pink} />} >
      <Text style={s.title}>Рабочий экран</Text>
      <View style={s.stats}>
        <Card style={s.stat}><Text style={s.statNum}>{driverCompletedOrders.length}</Text><Text style={s.muted}>Завершено</Text></Card>
        <Card style={s.stat}><Text style={s.statNum}>{Math.round(driverRecentEarnings).toLocaleString('ru-RU')} ₽</Text><Text style={s.muted}>Получено по завершённым</Text></Card>
      </View>
      <Text style={s.muted}>Показатели рассчитаны по последним 40 заказам, загруженным в рабочий экран.</Text>
      <Card><Text style={s.muted}>Рейтинг водителя</Text><Text style={s.heading}>{ratings.length ? (ratings.reduce((sum, item) => sum + Number(item.rating), 0) / ratings.length).toFixed(1) + ' ★' : 'Пока нет оценок'}</Text><Text style={s.muted}>{ratings.length} оценок пассажиров</Text></Card>
      <Card><Text style={s.muted}>Статус водителя</Text><Text style={s.heading}>{driverOnline ? 'На линии' : 'Не на линии'}</Text>
        <Button title={busy ? 'Сохраняем…' : driverOnline ? 'Завершить смену' : 'Выйти на линию'} onPress={() => driverOnline ? setDriverAvailability(false) : Alert.alert('Фоновая геолокация', 'Во время смены LadyGo будет передавать местоположение, даже когда приложение свёрнуто. На Android появится постоянное системное уведомление. Разрешение нужно только водителю на линии.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Продолжить', onPress: () => setDriverAvailability(true) }])} disabled={busy} secondary={!driverOnline} />
        <Text style={s.disclaimer}>При выходе на линию LadyGo обновляет геопозицию и статус доступности даже при свёрнутом приложении. На Android отображается системное уведомление о работе геолокации.</Text>
        {driverGpsError ? <Text style={{ color: C.red, fontSize: 12, marginTop: 8 }}>Геолокация: {driverGpsError}</Text> : driverOnline && <Text style={{ color: C.green, fontSize: 12, marginTop: 8 }}>Геопозиция отправлена{driverGpsUpdatedAt ? ' · ' + new Date(driverGpsUpdatedAt).toLocaleTimeString() : ''}</Text>}
      </Card>
      <Text style={s.section}>Доступные заказы</Text>
      {orders.filter(o => o.status === 'new' && !o.driver_id).map(o => <Card key={o.id}>
        <View style={s.rowBetween}><Pill>Новый заказ</Pill><Text style={s.price}>{Math.max(0, 30 - Math.floor((clock - new Date(offerTimes[o.id] || o.created_at).getTime()) / 1000))} сек.</Text></View><Text style={s.address}>Забрать: {o.pickup_address}</Text><Text style={s.address}>Доставить: {o.destination_address}</Text>
        {o.estimated_price_rub != null ? <Text style={s.muted}>Ориентир для пассажира: {money(o.estimated_price_rub)}</Text> : null}
        <Text style={s.muted}>Оплата: {o.payment_method === 'transfer_to_driver' ? 'Перевод водителю' : 'Наличными'}</Text>
        {o.estimated_price_rub != null
          ? <Text style={s.price}>Фиксированная цена: {money(o.estimated_price_rub)}</Text>
          : <Input label="Стоимость индивидуального маршрута, ₽" value={String(fare[o.id] || '')} onChangeText={v => setFare(p => ({ ...p, [o.id]: v }))} keyboardType="numeric" placeholder="Например, 450" />}
        <Button title="Принять заказ" disabled={busy} onPress={() => acceptOfferedOrder(o)} />
        <Button title="Пропустить" secondary onPress={() => skipOfferedOrder(o)} disabled={busy} compact />
      </Card>)}
      <Text style={s.section}>Мои активные поездки</Text>
      {orders.filter(o => ACTIVE.includes(o.status) && o.driver_id === user.id).map(o => <Card key={o.id}>
        <Pill>{STATUS[o.status] || o.status}</Pill><TripMap order={o} /><Text style={s.address}>Забрать: {o.pickup_address}</Text><Text style={s.address}>Доставить: {o.destination_address}</Text><Button title="Открыть навигацию" secondary onPress={() => openDriverNavigation(o)} />
        {Array.isArray(o.stops) && o.stops.length > 0 ? <View style={{ gap: 4 }}><Text style={s.label}>Промежуточные остановки</Text>{o.stops.map((stop, index) => <Text key={'order-stop-' + index} style={s.muted}>{index + 1}. {stop.address}</Text>)}</View> : null}
        <TripChat order={o} userId={user?.id} />
        {o.notes ? <Text style={s.muted}>{o.notes}</Text> : null}
        {o.passenger_phone ? <Button title="Позвонить пассажиру" secondary compact onPress={() => Linking.openURL('tel:' + o.passenger_phone)} /> : null}
        {o.status === 'accepted' && <Button title="Я на месте" onPress={() => updateOrder(o, 'arrived')} />}
        {o.status === 'arrived' && <Button title="Начать поездку" onPress={() => updateOrder(o, 'in_progress')} />}
        {o.status === 'in_progress' && <Button title="Завершить поездку" onPress={() => updateOrder(o, 'completed')} />}
        {['accepted','arrived'].includes(o.status) && <Button title={busy ? 'Отменяем…' : 'Отменить поездку'} danger secondary compact disabled={busy} onPress={() => cancelOrder(o)} />}
      </Card>)}
      {orders.filter(o => ACTIVE.includes(o.status) && o.driver_id === user.id).length === 0 && <Card><Text style={s.muted}>Активных назначенных заказов пока нет.</Text></Card>}
      <Text style={s.section}>История поездок</Text>
      {orders.filter(order => ['completed', 'cancelled', 'declined'].includes(order.status)).slice(0, 10).map(order => <Card key={'driver-history-' + order.id}>
        <View style={s.rowBetween}><Pill color={order.status === 'completed' ? C.green : C.muted}>{STATUS[order.status] || order.status}</Pill><Text style={s.muted}>{new Date(order.completed_at || order.created_at).toLocaleDateString()}</Text></View>
        <Text style={s.address}>{order.pickup_address} → {order.destination_address}</Text>
        <Text style={s.muted}>{order.status === 'completed' ? money(order.price_rub) : 'Без оплаты'}</Text>
      </Card>)}
      {orders.filter(order => ['completed', 'cancelled', 'declined'].includes(order.status)).length === 0 && <Card><Text style={s.muted}>Завершённые поездки появятся здесь.</Text></Card>}
    </ScrollView>}

    {tab === 'notifications' && <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.pink} />} >
      <Text style={s.title}>Уведомления</Text>
      {notifications.length === 0 && <Card><Text style={s.muted}>Пока новых уведомлений нет.</Text></Card>}
      {notifications.map(item => <TouchableOpacity key={item.id} activeOpacity={0.85} onPress={() => markNotificationRead(item)}>
        <Card style={!item.read_at ? { borderColor: C.pink, borderWidth: 1 } : null}>
          <View style={s.rowBetween}><Text style={s.heading}>{item.title}</Text>{!item.read_at && <Pill>Новое</Pill>}</View>
          <Text style={s.address}>{item.body}</Text>
          <Text style={s.muted}>{new Date(item.created_at).toLocaleString()}</Text>
        </Card>
      </TouchableOpacity>)}
    </ScrollView>}

    {mode === 'admin' && <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.pink} />} >
      <Text style={s.title}>Панель администратора</Text>
      <View style={s.stats}><Card style={s.stat}><Text style={s.statNum}>{orders.length}</Text><Text style={s.muted}>Заказов</Text></Card><Card style={s.stat}><Text style={s.statNum}>{applications.filter(a => a.status === 'pending').length}</Text><Text style={s.muted}>Заявок</Text></Card></View>
      <Text style={s.section}>Фиксированные цены маршрутов</Text>
      <Card>
        <Text style={s.muted}>Эти цены применяются автоматически. Администратор может менять их здесь — новая цена действует для новых заказов.</Text>
        {fixedPrices.map(item => <Input key={item.route_key} label={item.display_name + ', ₽'} value={fixedPriceDraft[item.route_key] ?? String(item.price_rub)} onChangeText={value => setFixedPriceDraft(p => ({ ...p, [item.route_key]: value }))} keyboardType="numeric" />)}
        <Button title={busy ? 'Сохраняем…' : 'Сохранить фиксированные цены'} onPress={() => saveFixedPrices().catch(e => Alert.alert('Фиксированные цены', errorText(e)))} disabled={busy || fixedPrices.length === 0} />
      </Card>
      <Text style={s.section}>Настройки тарифов</Text>
      <Card>
        <Text style={s.muted}>Укажи реальные цены LadyGo. Пока значения равны нулю, пассажирам не показывается выдуманная стоимость.</Text>
        {TARIFFS.map(item => {
          const draft = rateDraft[item.id] || {};
          return <View key={'rate-' + item.id} style={{ gap: 6 }}>
            <Text style={s.tariffName}>{item.name}</Text>
            <Input label="Базовая стоимость, ₽" value={draft.base_fare_rub || ''} onChangeText={value => setRateDraft(p => ({ ...p, [item.id]: { ...(p[item.id] || {}), base_fare_rub: value } }))} keyboardType="numeric" placeholder="0" />
            <Input label="Стоимость за 1 км, ₽" value={draft.per_km_rub || ''} onChangeText={value => setRateDraft(p => ({ ...p, [item.id]: { ...(p[item.id] || {}), per_km_rub: value } }))} keyboardType="numeric" placeholder="0" />
            <Input label="Минимальная стоимость, ₽" value={draft.minimum_fare_rub || ''} onChangeText={value => setRateDraft(p => ({ ...p, [item.id]: { ...(p[item.id] || {}), minimum_fare_rub: value } }))} keyboardType="numeric" placeholder="0" />
          </View>;
        })}
        <Button title={busy ? 'Сохраняем…' : 'Сохранить тарифы'} onPress={() => saveTariffRates().catch(e => Alert.alert('Тарифы', errorText(e)))} disabled={busy} />
      </Card>
      <Text style={s.section}>Заявки водителей</Text>
      {applications.map(a => <Card key={a.id}>{a.avatar_url ? <Image source={{ uri: a.avatar_url }} style={s.driverAvatar} /> : null}<Text style={s.tariffName}>{a.full_name || 'Водитель'}</Text><Text style={s.muted}>{a.phone}</Text>{a.vehicle_photo_url ? <Image source={{ uri: a.vehicle_photo_url }} style={s.vehiclePhoto} resizeMode="cover" /> : null}<Text style={s.muted}>{[a.vehicle_make, a.vehicle_model, a.vehicle_color, a.vehicle_year, a.vehicle_plate].filter(Boolean).join(' · ')}</Text><Text style={s.muted}>{a.experience}</Text><Pill color={a.status === 'approved' ? C.green : a.status === 'rejected' ? C.red : C.pink}>{a.status}</Pill>
        {a.status === 'pending' && <View style={s.row}><View style={{ flex: 1 }}><Button title="Одобрить" onPress={() => reviewApplication(a, true)} /></View><View style={{ flex: 1 }}><Button title="Отклонить" secondary danger onPress={() => reviewApplication(a, false)} /></View></View>}
      </Card>)}
      <Text style={s.section}>Обращения в поддержку</Text>
      {supportTickets.length === 0 && <Card><Text style={s.muted}>Открытых обращений пока нет.</Text></Card>}
      {supportTickets.map(ticket => <Card key={ticket.id}>
        <View style={s.rowBetween}><Text style={s.tariffName}>{ticket.subject}</Text><Pill color={ticket.status === 'resolved' ? C.green : C.pink}>{ticket.status === 'resolved' ? 'Решено' : ticket.status === 'in_progress' ? 'В работе' : 'Открыто'}</Pill></View>
        <Text style={s.muted}>Пользователь: {ticket.user_id}</Text>
        <Text style={s.address}>{ticket.message}</Text>
        {ticket.admin_reply ? <Text style={s.muted}>Ответ: {ticket.admin_reply}</Text> : <View style={{ gap: 6 }}>
          <Input label="Ответ пользователю" value={supportReplyDraft[ticket.id] || ''} onChangeText={value => setSupportReplyDraft(p => ({ ...p, [ticket.id]: value }))} multiline placeholder="Напиши ответ…" />
          <Button title="Ответить и закрыть" onPress={() => replyToSupportTicket(ticket)} disabled={busy} compact />
        </View>}
      </Card>)}
      <Text style={s.section}>Последние заказы</Text>
      {orders.slice(0, 12).map(o => <Card key={o.id}><Pill>{STATUS[o.status] || o.status}</Pill><Text style={s.address}>{o.pickup_address} → {o.destination_address}</Text></Card>)}
    </ScrollView>}

    {tab === 'profile' && <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.pink} />} >
      <Text style={s.title}>Профиль</Text><Card><Text style={s.tariffName}>{profile?.email}</Text><Text style={s.muted}>Роль: {role}</Text></Card>
      {!isDriver && !isAdmin && <Card>
        <Text style={s.section}>История поездок</Text>
        {historyOrders.length === 0
          ? <Text style={s.muted}>Завершённые и отменённые поездки появятся здесь.</Text>
          : historyOrders.map(order => <View key={'history-' + order.id} style={{ gap: 6, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 10 }}>
              <View style={s.rowBetween}>
                <Pill color={order.status === 'completed' ? C.green : C.muted}>{STATUS[order.status] || order.status}</Pill>
                <Text style={s.muted}>{new Date(order.completed_at || order.created_at).toLocaleDateString()}</Text>
              </View>
              <Text style={s.address}>{order.pickup_address} → {order.destination_address}</Text>
              <Text style={s.muted}>{money(order.price_rub)} · {TARIFFS.find(item => item.id === order.tariff_id)?.name || 'Поездка'}</Text>
              <Button title="Повторить маршрут" secondary compact onPress={() => repeatOrder(order)} />
            </View>)}
      </Card>}
      {isDriver && <Card>
        <Text style={s.section}>Моя карточка водителя</Text>
        <View style={s.row}>
          {driverAvatarUri || driverProfile?.avatar_url
            ? <Image source={{ uri: driverAvatarUri || driverProfile.avatar_url }} style={s.driverAvatar} />
            : <View style={s.driverAvatarPlaceholder}><Text style={s.avatarText}>В</Text></View>}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={s.tariffName}>Фотография водителя</Text>
            <Text style={s.muted}>Эту фотографию увидит пассажир после назначения поездки.</Text>
          </View>
        </View>
        <Button title="Выбрать фотографию" secondary compact onPress={() => chooseProfilePhoto(setDriverAvatarUri)} />
        {(driverVehiclePhotoUri || driverProfile?.vehicle_photo_url)
          ? <Image source={{ uri: driverVehiclePhotoUri || driverProfile.vehicle_photo_url }} style={s.vehiclePhoto} resizeMode="cover" />
          : null}
        <Button title="Фото автомобиля" secondary compact onPress={() => chooseProfilePhoto(setDriverVehiclePhotoUri, [4, 3])} />
        <Input label="Имя для пассажиров" value={driverProfileDraft.display_name || ''} onChangeText={value => setDriverProfileDraft(p => ({ ...p, display_name: value }))} />
        <Input label="Телефон" value={driverProfileDraft.phone || ''} onChangeText={value => setDriverProfileDraft(p => ({ ...p, phone: value }))} keyboardType="phone-pad" />
        <Input label="Опыт" value={driverProfileDraft.experience || ''} onChangeText={value => setDriverProfileDraft(p => ({ ...p, experience: value }))} />
        <Input label="Марка автомобиля" value={driverProfileDraft.vehicle_make || ''} onChangeText={value => setDriverProfileDraft(p => ({ ...p, vehicle_make: value }))} />
        <Input label="Модель автомобиля" value={driverProfileDraft.vehicle_model || ''} onChangeText={value => setDriverProfileDraft(p => ({ ...p, vehicle_model: value }))} />
        <Input label="Цвет автомобиля" value={driverProfileDraft.vehicle_color || ''} onChangeText={value => setDriverProfileDraft(p => ({ ...p, vehicle_color: value }))} />
        <Input label="Государственный номер" value={driverProfileDraft.vehicle_plate || ''} onChangeText={value => setDriverProfileDraft(p => ({ ...p, vehicle_plate: value }))} />
        <Input label="Год выпуска" value={driverProfileDraft.vehicle_year || ''} onChangeText={value => setDriverProfileDraft(p => ({ ...p, vehicle_year: value }))} keyboardType="number-pad" />
        <Button title={busy ? 'Сохраняем…' : 'Сохранить карточку водителя'} onPress={saveDriverProfile} disabled={busy} />
      </Card>}
      {!isDriver && !isAdmin && applications[0] && <Card><Text style={s.section}>Заявка водителя</Text><Pill color={applications[0].status === 'approved' ? C.green : applications[0].status === 'rejected' ? C.red : C.pink}>{applications[0].status === 'approved' ? 'Одобрена' : applications[0].status === 'rejected' ? 'Отклонена' : 'На рассмотрении'}</Pill></Card>}
      {!isDriver && !isAdmin && <Card><Text style={s.section}>Сохранённые адреса</Text><Input label="Название" value={savedLabel} onChangeText={setSavedLabel} placeholder="Дом, работа…" /><Input label="Адрес" value={savedAddress} onChangeText={setSavedAddress} placeholder="Введите адрес" /><Button title="Сохранить адрес" onPress={savePlace} compact />{savedPlaces.map(p => <TouchableOpacity key={p.id} onPress={() => { setPickup(p.address); setCoords(null); setRoute([]); setRouteInfo(null); setTab('ride'); }}><Text style={s.address}>{p.label}: {p.address}</Text></TouchableOpacity>)}</Card>}
      {!isDriver && !isAdmin && <Card>
        <Text style={s.section}>Стать водителем LadyGo</Text>
        <Text style={s.muted}>Заполни карточку водителя и автомобиля. Документы предъявишь администратору лично.</Text>
        <Input label="ФИО" value={applicationName} onChangeText={setApplicationName} />
        <Input label="Телефон" value={applicationPhone} onChangeText={setApplicationPhone} keyboardType="phone-pad" />
        <Text style={s.label}>Фотография водителя</Text>
        {applicationAvatarUri ? <Image source={{ uri: applicationAvatarUri }} style={s.profilePreview} /> : null}
        <Button title={applicationAvatarUri ? 'Изменить фотографию' : 'Добавить фотографию'} secondary compact onPress={() => chooseProfilePhoto(setApplicationAvatarUri)} />
        <Text style={s.section}>Автомобиль</Text>
        <Input label="Марка" value={applicationVehicleMake} onChangeText={setApplicationVehicleMake} placeholder="Например, Kia" />
        <Input label="Модель" value={applicationVehicleModel} onChangeText={setApplicationVehicleModel} placeholder="Например, Rio" />
        <Input label="Цвет" value={applicationVehicleColor} onChangeText={setApplicationVehicleColor} />
        <Input label="Государственный номер" value={applicationVehiclePlate} onChangeText={setApplicationVehiclePlate} />
        <Input label="Год выпуска" value={applicationVehicleYear} onChangeText={setApplicationVehicleYear} keyboardType="number-pad" />
        <Text style={s.label}>Фотография автомобиля</Text>
        {applicationVehiclePhotoUri ? <Image source={{ uri: applicationVehiclePhotoUri }} style={s.vehiclePhoto} resizeMode="cover" /> : null}
        <Button title={applicationVehiclePhotoUri ? 'Изменить фото автомобиля' : 'Добавить фото автомобиля'} secondary compact onPress={() => chooseProfilePhoto(setApplicationVehiclePhotoUri, [4, 3])} />
        <Input label="Опыт и дополнительная информация" value={applicationNote} onChangeText={setApplicationNote} multiline />
        <Button title={busy ? 'Отправляем…' : 'Отправить заявку'} onPress={submitApplication} disabled={busy} />
      </Card>}
      <Card><Text style={s.section}>Поддержка LadyGo</Text>
        <Input label="Тема обращения" value={supportSubject} onChangeText={setSupportSubject} placeholder="Например, вопрос по поездке" />
        <Input label="Сообщение" value={supportMessage} onChangeText={setSupportMessage} multiline placeholder="Опиши, что произошло или чем помочь…" />
        <Button title="Отправить обращение" onPress={submitSupportTicket} disabled={busy} />
        {supportTickets.map(ticket => <View key={ticket.id} style={{ gap: 5 }}>
          <View style={s.rowBetween}><Text style={s.tariffName}>{ticket.subject}</Text><Pill color={ticket.status === 'resolved' ? C.green : C.pink}>{ticket.status === 'resolved' ? 'Решено' : 'Открыто'}</Pill></View>
          <Text style={s.muted}>{ticket.message}</Text>
          {ticket.admin_reply ? <Text style={s.address}>Ответ поддержки: {ticket.admin_reply}</Text> : null}
        </View>)}
      </Card>
      <Button title="Написать на почту поддержки" secondary onPress={() => Linking.openURL('mailto:' + SUPPORT)} />
      <Button title="Позвонить водителю" secondary onPress={() => Linking.openURL('tel:' + PHONE)} />
      <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 12, marginBottom: 10 }}>Создано независимым автором @acyma</Text>
      <Button title="Выйти из аккаунта" danger secondary onPress={logout} />
    </ScrollView>}

    <View style={s.bottomNav}>
      {(mode === 'passenger' ? [{ id: 'ride', label: 'Заказать', icon: '⌖' }, { id: 'notifications', label: 'События', icon: '♧' }, { id: 'profile', label: 'Профиль', icon: '◯' }] : [{ id: 'ride', label: mode === 'admin' ? 'Обзор' : 'Работа', icon: '⌖' }, { id: 'notifications', label: 'События', icon: '♧' }, { id: 'profile', label: 'Профиль', icon: '◯' }]).map(item =>
        <TouchableOpacity key={item.id} onPress={() => setTab(item.id)} style={s.navItem}>
          <View style={s.navIconWrap}><Text style={[s.navIcon, tab === item.id && { color: C.pink }]}>{item.icon}</Text>{item.id === 'notifications' && unreadCount > 0 && <View style={s.navBadge}><Text style={s.navBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View>}</View>
          <Text style={[s.navLabel, tab === item.id && { color: C.pink, fontWeight: '800' }]}>{item.label}</Text>
        </TouchableOpacity>)}
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FCFAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: C.pale },
  auth: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: C.pale },
  brand: { color: C.pink, fontSize: 42, fontWeight: '900', textAlign: 'center', letterSpacing: -1 },
  brandSmall: { color: C.pink, fontSize: 26, fontWeight: '900', letterSpacing: -0.7 },
  tagline: { textAlign: 'center', color: C.muted, marginBottom: 28, marginTop: 4 },
  topSub: { color: C.muted, fontSize: 11, marginTop: -2 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: '#F7EEF1' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.pinkDark, fontSize: 17, fontWeight: '800' },
  driverAvatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.pale },
  driverAvatarPlaceholder: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  profilePreview: { width: 112, height: 112, borderRadius: 18, backgroundColor: C.pale },
  vehiclePhoto: { width: '100%', height: 150, borderRadius: 15, backgroundColor: C.pale },
  rolebar: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: C.pale, borderRadius: 15, padding: 4, marginBottom: 4 },
  roleButton: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  roleActive: { backgroundColor: C.white, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  roleText: { color: C.muted, fontWeight: '700', fontSize: 12 },
  roleTextActive: { color: C.pinkDark },
  content: { padding: 16, paddingBottom: 36, gap: 14 },
  mapWrap: { height: 245, borderRadius: 20, overflow: 'hidden', position: 'relative', backgroundColor: C.map },
  map: { flex: 1 },
  locButton: { position: 'absolute', bottom: 12, right: 12, backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, elevation: 3 },
  locText: { color: C.ink, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: C.white, borderRadius: 20, borderWidth: 1, borderColor: '#F2E8EC', padding: 17, gap: 11, shadowColor: '#5A3444', shadowOpacity: 0.045, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  title: { fontSize: 23, fontWeight: '900', color: C.ink, letterSpacing: -0.4 },
  heading: { fontSize: 19, fontWeight: '800', color: C.ink },
  section: { color: C.ink, fontSize: 16, fontWeight: '800', marginTop: 4 },
  field: { gap: 6, marginTop: 4 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: C.ink, backgroundColor: '#FFFCFD', fontSize: 15 },
  button: { backgroundColor: C.pink, paddingVertical: 15, paddingHorizontal: 15, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4, shadowColor: C.pinkDark, shadowOpacity: 0.13, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
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
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 9, paddingBottom: Platform.OS === 'android' ? 10 : 6, paddingHorizontal: 7, backgroundColor: C.white, elevation: 10 },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navIconWrap: { position: 'relative', minWidth: 26, alignItems: 'center' },
  navBadge: { position: 'absolute', top: -5, right: -12, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1, borderColor: C.white },
  navBadgeText: { color: C.white, fontSize: 9, fontWeight: '900' },
  navIcon: { color: C.muted, fontSize: 22, fontWeight: '700' },
  navLabel: { color: C.muted, fontSize: 10, fontWeight: '600' },
  savedChip: { backgroundColor: C.pale, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  savedChipText: { color: C.pinkDark, fontWeight: '700', fontSize: 12 },
});
