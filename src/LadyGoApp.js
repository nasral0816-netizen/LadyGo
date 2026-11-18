import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking,
  Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text,
  TextInput, TouchableOpacity, View
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { supabase, isConfigured } from './supabase';

const C = { pink:'#E85D88', deep:'#C83F70', ink:'#28232A', muted:'#8B8086', pale:'#FFF2F6', white:'#FFFFFF', line:'#F0E4E9', green:'#2E9B69', red:'#D94F68', blue:'#5489E8' };
const PHONE = '+79911121227';
const PROJECT_ID = '95ac82ec-010d-4770-9aba-9f52878e1b3b';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert:true, shouldPlaySound:true, shouldSetBadge:false, shouldShowBanner:true, shouldShowList:true }) });

const say = (title, message) => Alert.alert(title, message);
const errorText = e => {
  const m = String(e?.message || '');
  if (/invalid login credentials/i.test(m)) return 'Неверная почта или пароль.';
  if (/email not confirmed/i.test(m)) return 'Сначала подтверди почту по ссылке из письма.';
  if (/network request failed/i.test(m)) return 'Нет соединения. Проверь интернет.';
  return m || 'Что-то пошло не так. Попробуй ещё раз.';
};
const money = v => v == null ? 'Стоимость уточняется' : Number(v).toLocaleString('ru-RU') + ' ₽';
const statusText = s => ({new:'Ищем водителя',accepted:'Водитель назначен',arrived:'Водитель на месте',in_progress:'Поездка в пути',completed:'Поездка завершена',cancelled:'Заказ отменён',declined:'Заказ отклонён'}[s] || s);
const Button = ({children,onPress,secondary,danger,disabled,small}) => <TouchableOpacity activeOpacity={0.86} disabled={disabled} onPress={onPress} style={[styles.btn,secondary&&styles.btnSecondary,danger&&styles.btnDanger,disabled&&{opacity:.45},small&&{paddingVertical:10}]}><Text style={[styles.btnText,secondary&&{color:C.pink},danger&&{color:C.white}]}>{children}</Text></TouchableOpacity>;
const Input = ({label,value,onChangeText,placeholder,secureTextEntry,keyboardType,multiline}) => <View style={styles.inputWrap}><Text style={styles.inputLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder||label} placeholderTextColor="#B8AEB3" secureTextEntry={secureTextEntry} keyboardType={keyboardType} multiline={multiline} style={[styles.input,multiline&&{height:76,textAlignVertical:'top'}]}/></View>;
const Pill = ({children,color=C.pink}) => <View style={[styles.pill,{backgroundColor:color+'18'}]}><Text style={[styles.pillText,{color}]}>{children}</Text></View>;

export default function LadyGoApp() {
  const [session,setSession] = useState(null), [profile,setProfile] = useState(null);
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false);
  const [authMode,setAuthMode] = useState('login'), [email,setEmail] = useState(''), [password,setPassword] = useState(''), [phone,setPhone] = useState('');
  const [tab,setTab] = useState('ride'), [orders,setOrders] = useState([]), [applications,setApplications] = useState([]);
  const [from,setFrom] = useState(''), [to,setTo] = useState(''), [pickup,setPickup] = useState(null), [dropoff,setDropoff] = useState(null);
  const [note,setNote] = useState(''), [when,setWhen] = useState('Сейчас'), [fare,setFare] = useState('');
  const [driverOnline,setDriverOnline] = useState(false), [offer,setOffer] = useState(null), [offerSeconds,setOfferSeconds] = useState(25);
  const [driverLocation,setDriverLocation] = useState(null), [myLocation,setMyLocation] = useState(null);
  const [fullName,setFullName] = useState(''), [applicationPhone,setApplicationPhone] = useState('');
  const [selectedTariff,setSelectedTariff] = useState('Комфорт');
  const mapRef = useRef(null);
  const role = profile?.role;
  const activeOrder = useMemo(() => orders.find(o => ['new','accepted','arrived','in_progress'].includes(o.status) && (role==='driver' ? o.driver_id===session?.user?.id : o.passenger_id===session?.user?.id)),[orders,role,session]);
  const activePassengerOrder = role==='passenger' ? activeOrder : null;
  const activeDriverOrder = role==='driver' ? activeOrder : null;
  const pendingApplications = applications.filter(a=>a.status==='pending');

  async function loadProfile(id) {
    const {data,error} = await supabase.from('profiles').select('*').eq('id',id).maybeSingle();
    if(error) throw error;
    setProfile(data||null);
    if(data?.phone) setPhone(data.phone);
    return data;
  }
  async function loadOrders() {
    if(!session||!profile) return;
    let q=supabase.from('orders').select('*').order('created_at',{ascending:false}).limit(40);
    if(role==='passenger') q=q.eq('passenger_id',session.user.id);
    if(role==='driver') q=q.eq('driver_id',session.user.id);
    const {data,error}=await q;
    if(!error) setOrders(data||[]);
  }
  async function loadApplications() {
    if(!session||!profile) return;
    let q=supabase.from('driver_applications').select('*').order('created_at',{ascending:false});
    if(role!=='admin') q=q.eq('user_id',session.user.id);
    const {data,error}=await q;
    if(!error) setApplications(data||[]);
  }
  useEffect(()=>{
    if(!isConfigured){setLoading(false);return;}
    let alive=true;
    supabase.auth.getSession().then(async({data,error})=>{
      if(!alive)return;
      if(error){setLoading(false);return;}
      if(data.session){setSession(data.session);try{await loadProfile(data.session.user.id);}catch(e){say('Профиль',errorText(e));}}
      setLoading(false);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{
      setSession(s);
      if(!s){setProfile(null);setOrders([]);setApplications([]);setOffer(null);setDriverOnline(false);setLoading(false);}
      else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED') Promise.resolve().then(()=>loadProfile(s.user.id).catch(e=>say('Профиль',errorText(e))));
    });
    return()=>{alive=false;subscription.unsubscribe();};
  },[]);
  useEffect(()=>{if(session&&profile){loadOrders();loadApplications();}},[session,profile]);
  useEffect(()=>{
    if(!session||!profile)return;
    const ch=supabase.channel('lg-v3-orders-'+session.user.id).on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>loadOrders()).subscribe();
    const n=supabase.channel('lg-v3-apps-'+session.user.id).on('postgres_changes',{event:'*',schema:'public',table:'driver_applications'},()=>loadApplications()).subscribe();
    return()=>{supabase.removeChannel(ch);supabase.removeChannel(n);};
  },[session,profile]);
  useEffect(()=>{
    if(role!=='driver'||!session)return;
    let live=true;
    const loadOffer=async()=>{
      const {data}=await supabase.from('order_offers').select('id,order_id,created_at').eq('driver_id',session.user.id).eq('status','pending').order('created_at',{ascending:true}).limit(1).maybeSingle();
      if(!live||!data)return;
      const {data:order}=await supabase.from('orders').select('*').eq('id',data.order_id).eq('status','new').maybeSingle();
      if(live&&order){setOffer({...order,offer_id:data.id,offer_created_at:data.created_at});}
    };
    loadOffer();
    const ch=supabase.channel('lg-v3-offers-'+session.user.id).on('postgres_changes',{event:'*',schema:'public',table:'order_offers',filter:'driver_id=eq.'+session.user.id},loadOffer).subscribe();
    const state=AppState.addEventListener('change',s=>{if(s==='active')loadOffer();});
    return()=>{live=false;state.remove();supabase.removeChannel(ch);};
  },[role,session]);
  useEffect(()=>{
    if(!offer)return;
    const start=new Date(offer.offer_created_at).getTime();
    const tick=()=>setOfferSeconds(Math.max(0,25-Math.floor((Date.now()-start)/1000)));
    tick();const id=setInterval(tick,500);return()=>clearInterval(id);
  },[offer?.id]);
  useEffect(()=>{
    if(offer&&offerSeconds===0) skipOffer(true);
  },[offerSeconds,offer?.id]);
  useEffect(()=>{
    if(role!=='driver'||(!driverOnline&&!activeDriverOrder)||!session)return;
    let watcher,live=true;
    (async()=>{
      try{
        const p=await Location.requestForegroundPermissionsAsync();if(p.status!=='granted')return;
        watcher=await Location.watchPositionAsync({accuracy:Location.Accuracy.Balanced,timeInterval:5000,distanceInterval:10},async pos=>{
          if(!live||AppState.currentState!=='active')return;
          const point={driver_id:session.user.id,latitude:pos.coords.latitude,longitude:pos.coords.longitude,heading:pos.coords.heading,updated_at:new Date().toISOString()};
          setDriverLocation(point);
          await supabase.from('driver_locations').upsert(point,{onConflict:'driver_id'});
        });
      }catch(e){console.warn('location',e);}
    })();
    const heartbeat=driverOnline?setInterval(()=>supabase.from('driver_presence').update({updated_at:new Date().toISOString()}).eq('driver_id',session.user.id).eq('is_online',true),30000):null;
    return()=>{live=false;watcher?.remove();if(heartbeat)clearInterval(heartbeat);};
  },[role,driverOnline,activeDriverOrder?.id,session]);
  useEffect(()=>{
    if(!activePassengerOrder?.driver_id)return;
    let live=true;
    const fetchLoc=async()=>{const {data}=await supabase.from('driver_locations').select('*').eq('driver_id',activePassengerOrder.driver_id).maybeSingle();if(live)setDriverLocation(data||null);};
    fetchLoc();
    const ch=supabase.channel('lg-v3-location').on('postgres_changes',{event:'*',schema:'public',table:'driver_locations',filter:'driver_id=eq.'+activePassengerOrder.driver_id},p=>{if(live)setDriverLocation(p.new||null);}).subscribe();
    return()=>{live=false;supabase.removeChannel(ch);};
  },[activePassengerOrder?.driver_id]);
  useEffect(()=>{
    if(role!=='driver'||!session)return;
    (async()=>{
      try{
        const p=await Notifications.getPermissionsAsync();
        if(p.status!=='granted')await Notifications.requestPermissionsAsync();
        if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('driver-orders',{name:'Заказы LadyGo',importance:Notifications.AndroidImportance.MAX,sound:'default',vibrationPattern:[0,400,200,400]});
        try{const t=await Notifications.getExpoPushTokenAsync({projectId:PROJECT_ID});if(t?.data)await supabase.from('driver_push_tokens').upsert({driver_id:session.user.id,expo_push_token:t.data,device_platform:Platform.OS,updated_at:new Date().toISOString()},{onConflict:'driver_id,expo_push_token'});}catch(e){}
      }catch(e){}
    })();
  },[role,session?.user?.id]);

  async function signIn(){
    if(!email.trim()||!password)return say('Вход','Введи почту и пароль.');
    setBusy(true);const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});setBusy(false);if(error)say('Не удалось войти',errorText(error));
  }
  async function signUp(){
    if(!email.includes('@')||password.length<6||phone.replace(/\D/g,'').length<7)return say('Регистрация','Проверь почту, телефон и пароль (не менее 6 символов).');
    setBusy(true);const {data,error}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password,options:{emailRedirectTo:'ladygo://auth/callback',data:{phone:phone.trim()}}});setBusy(false);
    if(error)return say('Регистрация',errorText(error));
    if(data.session){setSession(data.session);await loadProfile(data.user.id);}else{say('Проверь почту','Открой письмо подтверждения, затем войди в аккаунт.');setAuthMode('login');}
  }
  async function locateMe(){
    setBusy(true);
    try{
      const p=await Location.requestForegroundPermissionsAsync();if(p.status!=='granted')throw new Error('Разреши доступ к геопозиции в настройках телефона.');
      const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      const point={latitude:pos.coords.latitude,longitude:pos.coords.longitude};setPickup(point);setMyLocation(point);
      const a=await Location.reverseGeocodeAsync(point);const x=a?.[0];const label=x?[x.street,x.streetNumber,x.name,x.city].filter(Boolean).join(', '):'Моё местоположение';setFrom(label||'Моё местоположение');
      mapRef.current?.animateToRegion({...point,latitudeDelta:0.012,longitudeDelta:0.012},500);
    }catch(e){say('Геолокация',errorText(e));}finally{setBusy(false);}
  }
  async function geocode(address){try{const a=await Location.geocodeAsync(address);return a?.[0]?{latitude:a[0].latitude,longitude:a[0].longitude}:null;}catch(e){return null;}}
  async function createOrder(){
    if(!from.trim()||!to.trim())return say('Куда едем?','Укажи адрес подачи и место назначения.');
    if(role!=='passenger')return;
    setBusy(true);
    try{
      const a=pickup||await geocode(from.trim()),b=dropoff||await geocode(to.trim());
      const {data,error}=await supabase.from('orders').insert({passenger_id:session.user.id,passenger_phone:profile?.phone||session.user.user_metadata?.phone||phone||null,pickup_address:from.trim(),destination_address:to.trim(),requested_for:when,notes:[selectedTariff,note.trim()].filter(Boolean).join(' · ')||null,status:'new',driver_id:null,price_rub:null,pickup_lat:a?.latitude??null,pickup_lng:a?.longitude??null,destination_lat:b?.latitude??null,destination_lng:b?.longitude??null}).select().single();
      if(error)throw error;
      setFrom('');setTo('');setPickup(null);setDropoff(null);setNote('');setTab('trips');setOrders(prev=>[data,...prev]);
      say('Заказ создан 💗','Ищем свободного водителя. Статус поездки будет обновляться здесь.');
    }catch(e){say('Не удалось создать заказ',errorText(e));}finally{setBusy(false);}
  }
  async function cancelOrder(order){
    Alert.alert('Отменить заказ?','Подтверди отмену поездки.',[{text:'Назад',style:'cancel'},{text:'Отменить',style:'destructive',onPress:async()=>{
      setBusy(true);const {error}=await supabase.rpc('cancel_my_order',{order_id:order.id});setBusy(false);if(error)say('Отмена',errorText(error));else loadOrders();
    }}]);
  }
  async function setOnline(next){
    setBusy(true);
    try{
      if(next){
        const p=await Location.requestForegroundPermissionsAsync();if(p.status!=='granted')throw new Error('Для выхода на линию нужно разрешить геолокацию.');
        const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
        await supabase.from('driver_locations').upsert({driver_id:session.user.id,latitude:pos.coords.latitude,longitude:pos.coords.longitude,heading:pos.coords.heading,updated_at:new Date().toISOString()},{onConflict:'driver_id'});
      }
      const {error}=await supabase.from('driver_presence').upsert({driver_id:session.user.id,is_online:next,updated_at:new Date().toISOString()},{onConflict:'driver_id'});
      if(error)throw error;
      if(!next&&!activeDriverOrder)await supabase.from('driver_locations').delete().eq('driver_id',session.user.id);
      setDriverOnline(next);say(next?'Ты на линии':'Смена завершена',next?'Теперь можно получать предложения ближайших заказов.':'Новые заказы больше не поступают.');
    }catch(e){say('Статус водителя',errorText(e));}finally{setBusy(false);}
  }
  async function skipOffer(expired=false){
    if(!offer)return;
    const id=offer.id;setOffer(null);
    const {error}=await supabase.rpc('ladygo_skip_order_offer',{p_order_id:id});
    if(error&&!expired)say('Не удалось пропустить',errorText(error));
  }
  async function acceptOffer(){
    const price=Number(fare.replace(',','.'));
    if(!Number.isFinite(price)||price<=0)return say('Стоимость','Введи цену поездки в рублях.');
    setBusy(true);const {error}=await supabase.rpc('ladygo_accept_order',{p_order_id:offer.id,p_price:price});setBusy(false);
    if(error){say('Заказ уже недоступен',errorText(error));setOffer(null);loadOrders();return;}
    setOffer(null);setFare('');loadOrders();say('Заказ принят','Поездка появилась в твоих активных заказах.');
  }
  async function tripStep(status){
    setBusy(true);const {error}=await supabase.rpc('ladygo_update_trip_status',{p_order_id:activeDriverOrder.id,p_status:status});setBusy(false);
    if(error)say('Не удалось обновить поездку',errorText(error));else loadOrders();
  }
  async function applyDriver(){
    if(!fullName.trim()||applicationPhone.trim().length<7)return say('Анкета водителя','Укажи имя и номер телефона.');
    setBusy(true);const {error}=await supabase.from('driver_applications').insert({user_id:session.user.id,full_name:fullName.trim(),phone:applicationPhone.trim(),experience:null,status:'pending'});setBusy(false);
    if(error)say('Заявка',errorText(error));else{setFullName('');setApplicationPhone('');loadApplications();say('Заявка отправлена','Администратор рассмотрит анкету.');}
  }
  async function reviewApplication(a,status){
    setBusy(true);const {error}=await supabase.from('driver_applications').update({status,reviewed_by:session.user.id,reviewed_at:new Date().toISOString()}).eq('id',a.id);setBusy(false);
    if(error)say('Не удалось сохранить решение',errorText(error));else loadApplications();
  }
  async function logout(){
    if(role==='driver'){await supabase.from('driver_presence').upsert({driver_id:session.user.id,is_online:false,updated_at:new Date().toISOString()},{onConflict:'driver_id'});if(!activeDriverOrder)await supabase.from('driver_locations').delete().eq('driver_id',session.user.id);}
    await supabase.auth.signOut();setTab('ride');
  }

  const mapOrder=activePassengerOrder||activeDriverOrder;
  const mapRegion=mapOrder?.pickup_lat!=null?{latitude:Number(mapOrder.pickup_lat),longitude:Number(mapOrder.pickup_lng),latitudeDelta:0.035,longitudeDelta:0.035}:myLocation?{...myLocation,latitudeDelta:0.035,longitudeDelta:0.035}:{latitude:43.905,longitude:42.716,latitudeDelta:0.16,longitudeDelta:0.16};
  if(loading)return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color={C.pink}/><Text style={styles.muted}>Загружаем LadyGo…</Text></SafeAreaView>;
  if(!isConfigured)return <SafeAreaView style={styles.center}><Text style={styles.brand}>LadyGo</Text><Text style={styles.muted}>Не настроено подключение к серверу. Проверь переменные EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY.</Text></SafeAreaView>;
  if(!session||!profile)return <SafeAreaView style={styles.auth}><StatusBar barStyle="dark-content"/><View style={styles.authLogo}><Text style={styles.brand}>LadyGo</Text><Text style={styles.tagline}>Поездки с заботой</Text></View><View style={styles.sheet}><Text style={styles.h1}>{authMode==='login'?'С возвращением':'Создать аккаунт'}</Text><Text style={styles.muted}>Безопасные и комфортные поездки</Text><Input label="Электронная почта" value={email} onChangeText={setEmail} keyboardType="email-address"/>{authMode==='signup'&&<Input label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>}<Input label="Пароль" value={password} onChangeText={setPassword} secureTextEntry/><Button disabled={busy} onPress={authMode==='login'?signIn:signUp}>{busy?'Подождите…':authMode==='login'?'Войти':'Зарегистрироваться'}</Button><TouchableOpacity onPress={()=>setAuthMode(authMode==='login'?'signup':'login')}><Text style={styles.link}>{authMode==='login'?'Создать новый аккаунт':'У меня уже есть аккаунт'}</Text></TouchableOpacity></View></SafeAreaView>;

  return <SafeAreaView style={styles.root}><StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={styles.topbar}><View><Text style={styles.brandSmall}>LadyGo</Text><Text style={styles.taglineSmall}>Поездки с заботой</Text></View><TouchableOpacity onPress={()=>say('Аккаунт',session.user.email+'\nРоль: '+role)} style={styles.avatar}><Text style={styles.avatarText}>{(profile.full_name||session.user.email||'L')[0].toUpperCase()}</Text></TouchableOpacity></View>
    {role==='passenger'&&<View style={styles.flex}>
      <View style={styles.mapWrap}><MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={mapRegion} region={undefined} showsUserLocation showsMyLocationButton={false} onMapReady={()=>{}}><>{pickup&&<Marker coordinate={pickup} title="Подача" pinColor={C.pink}/ >}{dropoff&&<Marker coordinate={dropoff} title="Назначение" pinColor={C.blue}/ >}{driverLocation&&activePassengerOrder?.driver_id&&<Marker coordinate={{latitude:Number(driverLocation.latitude),longitude:Number(driverLocation.longitude)}} title="Ваш водитель" pinColor={C.green}/ >}{pickup&&dropoff&&<Polyline coordinates={[pickup,dropoff]} strokeColor={C.pink} strokeWidth={4}/>}</></MapView><TouchableOpacity style={styles.locateButton} onPress={locateMe}><Text style={styles.locateText}>◎</Text></TouchableOpacity></View>
      <ScrollView style={styles.bottomPanel} contentContainerStyle={{paddingBottom:18}} keyboardShouldPersistTaps="handled">
        {activePassengerOrder?<View><Pill color={activePassengerOrder.status==='completed'?C.green:C.pink}>{statusText(activePassengerOrder.status)}</Pill><Text style={styles.h1}>{activePassengerOrder.status==='new'?'Подбираем водителя':activePassengerOrder.status==='completed'?'Спасибо за поездку!':'Ваша поездка'}</Text><Text style={styles.routeText}>Откуда: {activePassengerOrder.pickup_address}</Text><Text style={styles.routeText}>Куда: {activePassengerOrder.destination_address}</Text><Text style={styles.price}>{money(activePassengerOrder.price_rub)}</Text>{activePassengerOrder.status==='new'&&<Button secondary onPress={()=>cancelOrder(activePassengerOrder)}>Отменить заказ</Button>}</View>:<><Text style={styles.h1}>Куда поедем?</Text><View style={styles.addressCard}><View style={styles.routeDots}><View style={styles.dotStart}/><View style={styles.dotLine}/><View style={styles.dotEnd}/></View><View style={styles.addressInputs}><TextInput value={from} onChangeText={v=>{setFrom(v);setPickup(null);}} placeholder="Откуда" placeholderTextColor={C.muted} style={styles.addressInput}/><View style={styles.hairline}/><TextInput value={to} onChangeText={v=>{setTo(v);setDropoff(null);}} placeholder="Куда" placeholderTextColor={C.muted} style={styles.addressInput}/></View></View><TouchableOpacity onPress={locateMe} style={styles.locationLink}><Text style={styles.link}>◎ Моё местоположение</Text></TouchableOpacity><Text style={styles.sectionLabel}>Выберите поездку</Text><View style={styles.tariffs}>{['Эконом','Комфорт','Детский'].map(t=><TouchableOpacity key={t} onPress={()=>setSelectedTariff(t)} style={[styles.tariff,selectedTariff===t&&styles.tariffActive]}><Text style={styles.tariffIcon}>{t==='Эконом'?'🚗':t==='Комфорт'?'✨':'🧸'}</Text><Text style={styles.tariffName}>{t}</Text><Text style={styles.tariffSub}>{t==='Детский'?'Для поездок с детьми':'Удобная поездка'}</Text></TouchableOpacity>)}</View><Input label="Комментарий водителю (необязательно)" value={note} onChangeText={setNote} placeholder="Например, подъезд со двора"/><Button disabled={busy} onPress={createOrder}>{busy?'Создаём заказ…':'Заказать поездку'}</Button><Text style={styles.smallNote}>Стоимость подтвердит водитель перед поездкой.</Text></>}
      </ScrollView>
    </View>}
    {role==='driver'&&<ScrollView style={styles.flex} contentContainerStyle={styles.page}>
      <View style={styles.driverHero}><Text style={styles.h1}>Рабочий экран</Text><Pill color={driverOnline?C.green:C.muted}>{driverOnline?'На линии':'Не на линии'}</Pill><Text style={styles.muted}>Включи статус, чтобы получать новые предложения заказов.</Text><Button disabled={busy||!!activeDriverOrder} onPress={()=>setOnline(!driverOnline)} secondary={!driverOnline}>{driverOnline?'Завершить смену':'Выйти на линию'}</Button></View>
      {activeDriverOrder?<View style={styles.card}><Pill>{statusText(activeDriverOrder.status)}</Pill><Text style={styles.h1}>Текущая поездка</Text><Text style={styles.routeText}>Подача: {activeDriverOrder.pickup_address}</Text><Text style={styles.routeText}>Назначение: {activeDriverOrder.destination_address}</Text><Text style={styles.price}>{money(activeDriverOrder.price_rub)}</Text>{activeDriverOrder.status==='accepted'&&<Button onPress={()=>tripStep('arrived')}>Я прибыл</Button>}{activeDriverOrder.status==='arrived'&&<Button onPress={()=>tripStep('in_progress')}>Начать поездку</Button>}{activeDriverOrder.status==='in_progress'&&<Button onPress={()=>tripStep('completed')}>Завершить поездку</Button>}</View>:<View style={styles.card}><Text style={styles.h1}>Ожидание заказов</Text><Text style={styles.muted}>{driverOnline?'Когда пассажир создаст заказ, предложение появится здесь и прозвучит уведомление.':'Сейчас новые заказы не поступают.'}</Text></View>}
      <Text style={styles.sectionLabel}>История заказов</Text>{orders.filter(o=>o.driver_id===session.user.id).map(o=><View key={o.id} style={styles.listCard}><Text style={styles.bold}>{o.pickup_address} → {o.destination_address}</Text><Text style={styles.muted}>{statusText(o.status)} · {money(o.price_rub)}</Text></View>)}
    </ScrollView>}
    {role==='admin'&&<ScrollView style={styles.flex} contentContainerStyle={styles.page}><Text style={styles.h1}>Панель управления</Text><Text style={styles.muted}>Заявки водителей на проверку</Text>{pendingApplications.length===0&&<View style={styles.card}><Text style={styles.muted}>Новых заявок пока нет.</Text></View>}{pendingApplications.map(a=><View key={a.id} style={styles.card}><Text style={styles.bold}>{a.full_name}</Text><Text style={styles.muted}>{a.phone}</Text><Text style={styles.muted}>Подана: {new Date(a.created_at).toLocaleString('ru-RU')}</Text><View style={styles.row}><View style={styles.flex}><Button small onPress={()=>reviewApplication(a,'approved')}>Одобрить</Button></View><View style={styles.flex}><Button small danger onPress={()=>reviewApplication(a,'rejected')}>Отклонить</Button></View></View></View>)}</ScrollView>}
    {role==='passenger'&&tab==='trips'&&<View style={styles.flex}><ScrollView contentContainerStyle={styles.page}><Text style={styles.h1}>Мои поездки</Text>{orders.length===0?<Text style={styles.muted}>Здесь появятся ваши заказы.</Text>:orders.map(o=><View key={o.id} style={styles.listCard}><Pill color={o.status==='completed'?C.green:C.pink}>{statusText(o.status)}</Pill><Text style={styles.bold}>{o.pickup_address}</Text><Text style={styles.muted}>↓ {o.destination_address}</Text><Text style={styles.price}>{money(o.price_rub)}</Text>{o.status==='new'&&<Button secondary small onPress={()=>cancelOrder(o)}>Отменить</Button>}</View>)}</ScrollView></View>}
    {role==='passenger'&&tab==='profile'&&<ScrollView contentContainerStyle={styles.page}><Text style={styles.h1}>Профиль</Text><View style={styles.card}><Text style={styles.bold}>{session.user.email}</Text><Text style={styles.muted}>{profile.phone||phone||'Телефон не указан'}</Text><Button secondary onPress={()=>Linking.openURL('mailto:ladygosupport@gmail.com')}>Написать в поддержку</Button><Button danger onPress={logout}>Выйти из аккаунта</Button></View><Text style={styles.sectionLabel}>Стать водителем</Text>{applications[0]?<View style={styles.card}><Pill color={applications[0].status==='approved'?C.green:applications[0].status==='rejected'?C.red:C.pink}>{applications[0].status==='approved'?'Заявка одобрена':applications[0].status==='rejected'?'Заявка отклонена':'На рассмотрении'}</Pill><Text style={styles.muted}>Статус вашей анкеты водителя.</Text></View>:<View style={styles.card}><Input label="ФИО" value={fullName} onChangeText={setFullName}/><Input label="Телефон" value={applicationPhone} onChangeText={setApplicationPhone} keyboardType="phone-pad"/><Button disabled={busy} onPress={applyDriver}>Отправить анкету</Button></View>}</ScrollView>}
    {role==='passenger'&&<View style={styles.nav}>{[['ride','Заказать','⌖'],['trips','Поездки','▤'],['profile','Профиль','◉']].map(([k,label,ico])=><TouchableOpacity key={k} onPress={()=>setTab(k)} style={styles.navItem}><Text style={[styles.navIcon,tab===k&&{color:C.pink}]}>{ico}</Text><Text style={[styles.navLabel,tab===k&&{color:C.pink,fontWeight:'800'}]}>{label}</Text></TouchableOpacity>)}</View>}
    {role==='driver'&&<View style={styles.nav}><TouchableOpacity style={styles.navItem} onPress={()=>setTab('ride')}><Text style={styles.navIcon}>▦</Text><Text style={styles.navLabel}>Заказы</Text></TouchableOpacity><TouchableOpacity style={styles.navItem} onPress={logout}><Text style={styles.navIcon}>◉</Text><Text style={styles.navLabel}>Выйти</Text></TouchableOpacity></View>}
    {offer&&role==='driver'&&<View style={styles.offerOverlay}><View style={styles.offerSheet}><View style={styles.offerHead}><Pill>Новый заказ</Pill><Text style={styles.countdown}>{offerSeconds} сек.</Text></View><Text style={styles.h1}>Предложение поездки</Text><Text style={styles.routeText}>● {offer.pickup_address}</Text><Text style={styles.routeText}>↓ {offer.destination_address}</Text><Input label="Предложить стоимость, ₽" value={fare} onChangeText={setFare} keyboardType="numeric"/><Button disabled={busy} onPress={acceptOffer}>Принять заказ</Button><Button secondary onPress={()=>skipOffer(false)}>Пропустить</Button></View></View>}
  </SafeAreaView>;
}

const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:C.white},flex:{flex:1},center:{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:C.white},auth:{flex:1,backgroundColor:C.pale,justifyContent:'center',padding:20},authLogo:{alignItems:'center',marginBottom:28},brand:{fontSize:42,fontWeight:'900',letterSpacing:-1.5,color:C.pink},tagline:{fontSize:14,color:C.muted,marginTop:2},sheet:{backgroundColor:C.white,borderRadius:28,padding:22,elevation:5},h1:{fontSize:24,fontWeight:'900',color:C.ink,letterSpacing:-.5,marginBottom:8},muted:{fontSize:13,color:C.muted,lineHeight:19,marginBottom:10},btn:{backgroundColor:C.pink,paddingVertical:15,paddingHorizontal:18,borderRadius:16,alignItems:'center',justifyContent:'center',marginTop:10},btnSecondary:{backgroundColor:C.pale,borderWidth:1,borderColor:'#F7D5E1'},btnDanger:{backgroundColor:C.red},btnText:{color:C.white,fontSize:15,fontWeight:'800'},link:{color:C.pink,fontWeight:'800',textAlign:'center',marginTop:16},inputWrap:{marginTop:12},inputLabel:{fontSize:12,fontWeight:'800',color:C.muted,marginBottom:6},input:{backgroundColor:'#FBF8F9',borderWidth:1,borderColor:C.line,borderRadius:14,paddingHorizontal:14,paddingVertical:13,color:C.ink,fontSize:15},topbar:{height:66,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:C.line},brandSmall:{fontSize:24,fontWeight:'900',color:C.pink,letterSpacing:-.7},taglineSmall:{fontSize:10,color:C.muted,marginTop:-2},avatar:{width:38,height:38,borderRadius:20,backgroundColor:C.pale,alignItems:'center',justifyContent:'center'},avatarText:{color:C.pink,fontWeight:'900',fontSize:16},mapWrap:{flex:1,minHeight:220},locateButton:{position:'absolute',right:16,bottom:16,width:46,height:46,borderRadius:23,backgroundColor:C.white,alignItems:'center',justifyContent:'center',elevation:4},locateText:{fontSize:27,color:C.pink},bottomPanel:{maxHeight:'62%',backgroundColor:C.white,borderTopLeftRadius:26,borderTopRightRadius:26,marginTop:-20,paddingHorizontal:18,paddingTop:20,elevation:10},addressCard:{flexDirection:'row',borderWidth:1,borderColor:C.line,borderRadius:18,padding:12,backgroundColor:'#FFFCFD'},routeDots:{width:22,alignItems:'center',paddingTop:13},dotStart:{width:10,height:10,borderRadius:5,backgroundColor:C.pink},dotLine:{height:24,width:1,borderStyle:'dashed',borderWidth:.7,borderColor:'#CBBBC2'},dotEnd:{width:10,height:10,borderRadius:2,backgroundColor:C.blue},addressInputs:{flex:1},addressInput:{height:42,fontSize:15,color:C.ink},hairline:{height:1,backgroundColor:C.line},locationLink:{alignSelf:'flex-start',marginTop:7},sectionLabel:{fontSize:13,fontWeight:'900',color:C.ink,marginTop:18,marginBottom:9},tariffs:{flexDirection:'row',gap:8},tariff:{flex:1,borderWidth:1,borderColor:C.line,borderRadius:15,padding:10,alignItems:'center'},tariffActive:{borderColor:C.pink,backgroundColor:C.pale},tariffIcon:{fontSize:23},tariffName:{fontSize:12,fontWeight:'900',color:C.ink,marginTop:4},tariffSub:{fontSize:9,color:C.muted,textAlign:'center',marginTop:3},smallNote:{fontSize:10,color:C.muted,textAlign:'center',marginTop:8},nav:{height:66,borderTopWidth:1,borderColor:C.line,flexDirection:'row',justifyContent:'space-around',backgroundColor:C.white},navItem:{flex:1,alignItems:'center',justifyContent:'center'},navIcon:{fontSize:20,color:C.muted},navLabel:{fontSize:10,color:C.muted,marginTop:2},page:{padding:18,paddingBottom:30},driverHero:{backgroundColor:C.pale,borderRadius:22,padding:18,marginBottom:14},card:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:20,padding:16,marginTop:12},listCard:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:17,padding:14,marginTop:10},pill:{alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:6,borderRadius:20,marginBottom:10},pillText:{fontSize:11,fontWeight:'900'},routeText:{fontSize:14,color:C.ink,lineHeight:22,marginTop:4},price:{fontSize:21,fontWeight:'900',color:C.pink,marginTop:12},bold:{fontSize:15,fontWeight:'800',color:C.ink,marginBottom:5},row:{flexDirection:'row',gap:10},offerOverlay:{position:'absolute',left:0,right:0,top:0,bottom:0,backgroundColor:'#1E172099',justifyContent:'flex-end'},offerSheet:{backgroundColor:C.white,borderTopLeftRadius:28,borderTopRightRadius:28,padding:22,paddingBottom:30},offerHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},countdown:{fontSize:16,fontWeight:'900',color:C.pink}
});
