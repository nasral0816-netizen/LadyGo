import React, { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, Linking } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { supabase, isConfigured } from './src/supabase';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';

const PINK = '#E85D88';
const PALE = '#FFF4F7';
const DARK = '#28232A';

function Button({ title, onPress, secondary=false, disabled=false }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && {opacity:.45}]}><Text style={[styles.buttonText, secondary && {color:PINK}]}>{title}</Text></TouchableOpacity>;
}
function Field({label, value, onChangeText, placeholder, secureTextEntry, keyboardType}) {
  return <View style={styles.fieldWrap}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder || label} placeholderTextColor="#A69AA0" secureTextEntry={secureTextEntry} keyboardType={keyboardType} style={styles.input}/></View>;
}

export default function App() {
  const [session,setSession] = useState(null);
  const [profile,setProfile] = useState(null);
  const [loading,setLoading] = useState(true);
  const [screen,setScreen] = useState('home');
  const [email,setEmail] = useState(''); const [password,setPassword] = useState(''); const [phone,setPhone] = useState('');
  const [from,setFrom] = useState(''); const [to,setTo] = useState(''); const [when,setWhen] = useState('Как можно скорее'); const [notes,setNotes] = useState('');
  const [orders,setOrders] = useState([]); const [busy,setBusy] = useState(false);
  const [fare,setFare] = useState({});
  const [pickupCoords,setPickupCoords] = useState(null);
  const [locationBusy,setLocationBusy] = useState(false);

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({data}) => { setSession(data.session); if(data.session) loadProfile(data.session.user.id); else setLoading(false); });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next) => { setSession(next); if(next) loadProfile(next.user.id); else {setProfile(null);setOrders([]);setLoading(false);} });
    return () => subscription.unsubscribe();
  },[]);

  async function loadProfile(id) {
    const {data,error} = await supabase.from('profiles').select('*').eq('id',id).maybeSingle();
    if(error) Alert.alert('Профиль',error.message);
    setProfile(data); setLoading(false);
  }
  async function loadOrders() {
    if(!session) return;
    setBusy(true);
    let q = supabase.from('orders').select('*').order('created_at',{ascending:false}).limit(50);
    if(profile?.role !== 'driver') q = q.eq('passenger_id',session.user.id);
    const {data,error} = await q;
    if(error) Alert.alert('Поездки',error.message); else setOrders(data || []);
    setBusy(false);
  }
  useEffect(() => { if(session && profile) loadOrders(); },[session,profile]);
  useEffect(() => {
    if(!session || !profile) return;
    const channel = supabase.channel('ladygo-orders-'+session.user.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'orders'},() => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },[session,profile]);

  async function signIn() {
    if(!email.trim() || password.length < 6) return Alert.alert('Вход','Укажи email и пароль не короче 6 символов.');
    const {error} = await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error) Alert.alert('Не удалось войти',error.message);
  }
  async function signUp() {
    if(!email.trim() || password.length < 6 || phone.trim().length < 7) return Alert.alert('Регистрация','Укажи email, номер телефона и пароль не короче 6 символов.');
    const {data,error} = await supabase.auth.signUp({email:email.trim(),password,options:{data:{phone:phone.trim()}}});
    if(error) Alert.alert('Регистрация',error.message);
    else if(data.session) await loadProfile(data.session.user.id);
    else Alert.alert('Почти готово','Проверь почту и подтверди регистрацию, если подтверждение включено в Supabase.');
  }
  async function useMyLocation() {
    setLocationBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') { Alert.alert('Нужен доступ к геопозиции','Разреши LadyGo доступ к местоположению или введи адрес вручную.'); return; }
      const pos = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.Balanced});
      setPickupCoords({latitude:pos.coords.latitude,longitude:pos.coords.longitude});
      const places = await Location.reverseGeocodeAsync({latitude:pos.coords.latitude,longitude:pos.coords.longitude});
      if (places?.[0]) { const a=places[0]; const text=[a.street,a.streetNumber,a.name,a.city].filter(Boolean).join(', '); if(text) setFrom(text); }
      Alert.alert('Местоположение получено','Проверь адрес подачи перед отправкой заявки.');
    } catch(e) { Alert.alert('Геопозиция','Не удалось определить местоположение. Введи адрес вручную.'); }
    finally { setLocationBusy(false); }
  }
  async function createOrder() {
    if(!from.trim() || !to.trim()) return Alert.alert('Не хватает адресов','Заполни адрес подачи и назначения.');
    if(!session) return;
    setBusy(true);
    const {error} = await supabase.from('orders').insert({passenger_id:session.user.id,passenger_phone:profile?.phone || session.user.user_metadata?.phone || null,pickup_address:from.trim(),destination_address:to.trim(),requested_for:when,notes:notes.trim() || null,status:'new',pickup_lat:pickupCoords?.latitude ?? null,pickup_lng:pickupCoords?.longitude ?? null});
    setBusy(false);
    if(error) Alert.alert('Заказ не отправлен',error.message);
    else { setFrom('');setTo('');setNotes('');setPickupCoords(null);setScreen('trips');loadOrders();Alert.alert('Заказ отправлен','Водитель увидит заявку и подтвердит стоимость.'); }
  }
  async function cancelOrder(id) {
    const {error} = await supabase.rpc('cancel_my_order', { order_id: id });
    if(error) Alert.alert('Не удалось отменить',error.message); else loadOrders();
  }
  async function updateOrder(id, patch) {
    const {error} = await supabase.from('orders').update(patch).eq('id',id);
    if(error) Alert.alert('Не удалось обновить',error.message); else loadOrders();
  }
  async function acceptOrder(order) {
    const value = Number(String(fare[order.id] || '').replace(',','.'));
    if(!Number.isFinite(value) || value <= 0) return Alert.alert('Стоимость','Введи корректную стоимость в рублях.');
    await updateOrder(order.id,{driver_id:session.user.id,price_rub:value,status:'accepted'});
  }
  async function signOut(){ await supabase.auth.signOut(); setScreen('home'); }

  if(!isConfigured) return <SafeAreaView style={styles.center}><Text style={styles.logo}>LadyGo</Text><Text style={styles.heading}>Нужно подключить сервер</Text><Text style={styles.body}>Скопируй .env.example в .env и добавь URL и anon key своего проекта Supabase. Затем перезапусти Expo.</Text></SafeAreaView>;
  if(loading) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color={PINK}/><Text style={styles.body}>Загружаем LadyGo…</Text></SafeAreaView>;

  if(!session) return <SafeAreaView style={styles.container}><ExpoStatusBar style="dark"/><View style={styles.auth}><Text style={styles.logo}>LadyGo</Text><Text style={styles.subtitle}>Поездки с заботой</Text><Text style={styles.heading}>Добро пожаловать</Text><Field label="Электронная почта" value={email} onChangeText={setEmail} keyboardType="email-address"/><Field label="Телефон для связи" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+7 900 000-00-00"/><Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry/><Button title="Войти" onPress={signIn}/><Button title="Создать аккаунт" secondary onPress={signUp}/><Text style={styles.hint}>Для теста создай пассажирский аккаунт. Роль водителя назначается владельцем проекта в базе данных.</Text></View></SafeAreaView>;

  return <SafeAreaView style={styles.container}><ExpoStatusBar style="dark"/><View style={styles.top}><Text style={styles.logo}>LadyGo</Text><Text style={styles.role}>{profile?.role === 'driver' ? 'РЕЖИМ ВОДИТЕЛЯ' : 'ПАССАЖИР'}</Text></View>
    <View style={styles.nav}>{[['home','Главная'],['order','Заказать'],['trips','Поездки'],['profile','Профиль']].map(([key,label])=><TouchableOpacity key={key} onPress={()=>{setScreen(key);if(key==='trips')loadOrders();}}><Text style={[styles.navText,screen===key&&styles.navActive]}>{label}</Text></TouchableOpacity>)}</View>
    <ScrollView contentContainerStyle={styles.content}>
      {screen==='home' && <><Text style={styles.heading}>Здравствуйте! 💗</Text><Text style={styles.body}>LadyGo — частные поездки с подтверждением стоимости водителем.</Text><View style={styles.hero}><Text style={styles.heroTitle}>Ваша поездка начинается здесь</Text><Text style={styles.heroBody}>Укажите адреса, отправьте заявку и дождитесь подтверждения водителя.</Text><Button title="Заказать поездку" onPress={()=>setScreen('order')}/></View><Text style={styles.hint}>Сервис находится в тестовой разработке. Не используйте его для реальных поездок, пока не проверены безопасность, законность и работа всех процессов.</Text></>}
      {screen==='order' && <><Text style={styles.heading}>Новая поездка</Text><Button title={locationBusy?'Определяем…':'📍 Указать моё местоположение'} secondary onPress={useMyLocation} disabled={locationBusy}/>{pickupCoords&&<MapView style={styles.map} initialRegion={{...pickupCoords,latitudeDelta:0.012,longitudeDelta:0.012}} region={{...pickupCoords,latitudeDelta:0.012,longitudeDelta:0.012}}><Marker coordinate={pickupCoords} title="Место подачи" pinColor={PINK}/></MapView>}<Field label="Откуда" value={from} onChangeText={setFrom} placeholder="Адрес подачи"/><Field label="Куда" value={to} onChangeText={setTo} placeholder="Адрес назначения"/><Field label="Когда" value={when} onChangeText={setWhen} placeholder="Например, сегодня в 18:30"/><Field label="Комментарий водителю" value={notes} onChangeText={setNotes} placeholder="Подъезд, ориентир…"/><View style={styles.notice}><Text style={styles.noticeText}>Стоимость не списывается автоматически: водитель сначала подтверждает цену. Оплата в приложении пока не реализована.</Text></View><Button title={busy?'Отправляем…':'Отправить заявку'} onPress={createOrder} disabled={busy}/></>}
      {screen==='trips' && <><Text style={styles.heading}>{profile?.role==='driver'?'Заявки':'Мои поездки'}</Text><Button title="Обновить" secondary onPress={loadOrders}/>{busy&&<ActivityIndicator color={PINK}/>}{orders.map(o=><View key={o.id} style={styles.orderCard}><Text style={styles.status}>{statusLabel(o.status)}</Text><Text style={styles.orderText}>Откуда: {o.pickup_address}</Text><Text style={styles.orderText}>Куда: {o.destination_address}</Text><Text style={styles.orderText}>Когда: {o.requested_for}</Text>{o.price_rub!=null&&<Text style={styles.price}>{o.price_rub} ₽</Text>}{o.pickup_lat!=null&&o.pickup_lng!=null&&<MapView style={styles.mapSmall} initialRegion={{latitude:Number(o.pickup_lat),longitude:Number(o.pickup_lng),latitudeDelta:0.012,longitudeDelta:0.012}}><Marker coordinate={{latitude:Number(o.pickup_lat),longitude:Number(o.pickup_lng)}} title="Подача" pinColor={PINK}/></MapView>}{profile?.role==='driver'&&o.passenger_phone&&<Button title="Позвонить пассажиру" secondary onPress={()=>Linking.openURL('tel:'+o.passenger_phone)}/>}{profile?.role!=='driver'&&o.status==='new'&&<Button title="Отменить заявку" secondary onPress={()=>cancelOrder(o.id)}/>} {o.notes&&<Text style={styles.hint}>Комментарий: {o.notes}</Text>}
        {profile?.role==='driver'&&o.status==='new'&&<><Field label="Стоимость, ₽" value={fare[o.id]||''} onChangeText={v=>setFare(p=>({...p,[o.id]:v}))} keyboardType="decimal-pad"/><Button title="Принять и подтвердить цену" onPress={()=>acceptOrder(o)}/><Button title="Отклонить" secondary onPress={()=>updateOrder(o.id,{status:'declined'})}/></>}
        {profile?.role==='driver'&&o.status==='accepted'&&<Button title="Поездка завершена" onPress={()=>updateOrder(o.id,{status:'completed'})}/>}

      </View>)}{!busy&&orders.length===0&&<Text style={styles.body}>Пока поездок нет.</Text>}</>}
      {screen==='profile'&&<><Text style={styles.heading}>Профиль</Text><Text style={styles.body}>{session.user.email}</Text><Text style={styles.body}>Режим: {profile?.role==='driver'?'Водитель':'Пассажир'}</Text><Text style={styles.body}>Телефон: {profile?.phone || 'не указан'}</Text><Button title="Позвонить" secondary onPress={()=>Linking.openURL('tel:+70000000000')}/><Text style={styles.hint}>Кнопка звонка пассажиру доступна водителю в карточке принятой заявки. Номер не подтверждается SMS в этой версии.</Text><Button title="Выйти" onPress={signOut}/></>}
    </ScrollView>
  </SafeAreaView>;
}
function statusLabel(s){return ({new:'Новая заявка',accepted:'Водитель подтвердил стоимость',declined:'Отклонена',cancelled:'Отменена',completed:'Завершена'})[s]||s;}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:'#fff'},center:{flex:1,backgroundColor:PALE,alignItems:'center',justifyContent:'center',padding:28},auth:{flex:1,justifyContent:'center',padding:24,backgroundColor:PALE},top:{paddingHorizontal:20,paddingTop:12,paddingBottom:10,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},logo:{fontSize:32,fontWeight:'900',color:PINK,letterSpacing:-1},role:{fontSize:10,fontWeight:'800',color:PINK,letterSpacing:1},subtitle:{fontSize:14,color:'#806C75',marginBottom:34},heading:{fontSize:25,fontWeight:'800',color:DARK,marginBottom:14},body:{fontSize:15,lineHeight:23,color:'#625A60',marginBottom:16},nav:{flexDirection:'row',justifyContent:'space-around',paddingVertical:12,borderTopWidth:1,borderBottomWidth:1,borderColor:'#F3E5EA'},navText:{fontSize:13,color:'#8A7D83',fontWeight:'600'},navActive:{color:PINK,fontWeight:'900'},content:{padding:20,paddingBottom:40},fieldWrap:{marginBottom:14},label:{fontSize:13,fontWeight:'700',color:DARK,marginBottom:7},input:{borderWidth:1,borderColor:'#EADDE2',borderRadius:13,paddingHorizontal:14,paddingVertical:13,fontSize:15,color:DARK,backgroundColor:'#FFFCFD'},button:{backgroundColor:PINK,borderRadius:13,padding:15,alignItems:'center',marginTop:8,marginBottom:6},secondary:{backgroundColor:'#FCE7EE',borderWidth:1,borderColor:'#F6CBD9'},buttonText:{color:'#fff',fontWeight:'800',fontSize:15},hero:{backgroundColor:PALE,borderRadius:20,padding:20,marginVertical:14},heroTitle:{fontSize:20,fontWeight:'800',color:DARK,marginBottom:8},heroBody:{fontSize:14,lineHeight:21,color:'#75666D',marginBottom:12},hint:{fontSize:12,lineHeight:18,color:'#93858C',marginTop:12},notice:{backgroundColor:'#FFF4E8',borderRadius:12,padding:13,marginVertical:8},noticeText:{fontSize:13,lineHeight:19,color:'#765B3E'},map:{height:190,borderRadius:14,marginBottom:14},mapSmall:{height:150,borderRadius:12,marginTop:10,marginBottom:8},orderCard:{borderWidth:1,borderColor:'#F1DCE4',borderRadius:16,padding:15,marginVertical:8},status:{fontWeight:'900',color:PINK,marginBottom:9},orderText:{fontSize:14,color:DARK,marginBottom:5},price:{fontSize:21,fontWeight:'900',color:PINK,marginTop:8}});
