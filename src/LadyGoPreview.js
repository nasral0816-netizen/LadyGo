import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map as MapLibreView } from '@maplibre/maplibre-react-native';

const pink = '#E84F87';
const styleUrl = 'https://tiles.openfreemap.org/styles/liberty';

// Изолированный демонстрационный экран: все записи и координаты вымышлены.
// Здесь нет GPS, Supabase-запросов, заказов или управления водителями.
const sampleHistory = [
  { id: 'LG-DEMO-1042', date: '21 ноября · 14:20', route: 'Курортный бульвар → Вокзальная', status: 'Завершена', amount: '450 Р' },
  { id: 'LG-DEMO-1038', date: '20 ноября · 11:05', route: 'Проспект Победы → Колоннада', status: 'Завершена', amount: '320 Р' },
  { id: 'LG-DEMO-1021', date: '18 ноября · 18:40', route: 'Улица Ленина → Старое озеро', status: 'Отменена', amount: '—' },
];
const sampleApplications = [
  { name: 'Анна К.', car: 'Kia Rio · белый', status: 'На проверке' },
  { name: 'Мария С.', car: 'Hyundai Solaris · серый', status: 'Нужны документы' },
];

export default function LadyGoPreview({ onBack }) {
  const [demoOrders, setDemoOrders] = useState([]);
  const [demoCounter, setDemoCounter] = useState(1);
  const addDemoOrder = () => {
    const id = 'LG-TEST-' + String(demoCounter).padStart(4, '0');
    setDemoOrders(current => [{ id, date: 'Только что', route: 'Тестовый адрес подачи → Тестовое назначение', status: 'Новый тестовый заказ', amount: 'Тест' }, ...current]);
    setDemoCounter(value => value + 1);
  };
  const cancelDemoOrder = id => setDemoOrders(current => current.map(order =>
    order.id === id ? { ...order, status: 'Отменена в демо', amount: '—' } : order
  ));
  const points = [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [42.7148, 43.9052] }, properties: { color: '#16845B' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [42.7212, 43.9111] }, properties: { color: pink } },
  ];
  const route = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[42.7148,43.9052],[42.7160,43.9064],[42.7178,43.9070],[42.7191,43.9090],[42.7212,43.9111]] },
    properties: {},
  };
  return <SafeAreaView style={s.screen}>
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backText}>‹</Text></TouchableOpacity>
      <View style={{ flex: 1 }}><Text style={s.brand}>LadyGo</Text><Text style={s.sub}>Предпросмотр обновлённого интерфейса</Text></View>
      <View style={s.demoPill}><Text style={s.demoText}>ДЕМО</Text></View>
    </View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.notice}><Text style={s.noticeTitle}>Демонстрационные данные</Text><Text style={s.noticeText}>Карта, маршруты, история и анкеты ниже — примеры интерфейса. Они не связаны с реальными поездками или людьми.</Text></View>
      <Text style={s.section}>Карта LadyGo</Text>
      <View style={s.map}>
        <MapLibreView style={{ flex: 1 }} mapStyle={styleUrl} androidView="texture" attribution logo={false}>
          <Camera center={[42.718,43.908]} zoom={14.8} pitch={55} />
          <GeoJSONSource id="preview-route" data={route}>
            <Layer id="preview-route-outline" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 9, 'line-cap': 'round', 'line-join': 'round' }} />
            <Layer id="preview-route-line" type="line" paint={{ 'line-color': pink, 'line-width': 5, 'line-cap': 'round', 'line-join': 'round' }} />
          </GeoJSONSource>
          <GeoJSONSource id="preview-points" data={{ type: 'FeatureCollection', features: points }}>
            <Layer id="preview-point-circles" type="circle" paint={{ 'circle-radius': 9, 'circle-color': ['get','color'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }} />
          </GeoJSONSource>
        </MapLibreView>
        <View style={s.mapTag}><Text style={s.mapTagText}>Маршрут-пример · Кисловодск</Text></View>
      </View>
      <View style={s.stats}>
        <View style={s.stat}><Text style={s.statValue}>24</Text><Text style={s.statLabel}>Пример поездок</Text></View>
        <View style={s.stat}><Text style={s.statValue}>4,9</Text><Text style={s.statLabel}>Средняя оценка</Text></View>
        <View style={s.stat}><Text style={s.statValue}>2</Text><Text style={s.statLabel}>Анкеты в демо</Text></View>
      </View>
      <Text style={s.section}>Проверка кнопок · демо</Text>
      <View style={s.card}>
        <Text style={s.routeText}>Создай тестовый заказ</Text>
        <Text style={s.mutedSmall}>Никакие данные не отправляются на сервер, водителям или пассажирам.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={addDemoOrder} style={s.demoButton}>
          <Text style={s.demoButtonText}>＋ Создать тестовый заказ</Text>
        </TouchableOpacity>
      </View>
      {demoOrders.map(order => <View key={order.id} style={s.card}>
        <View style={s.cardTop}><Text style={s.cardId}>{order.id}</Text><Text style={s.status}>{order.status}</Text></View>
        <Text style={s.routeText}>{order.route}</Text>
        <View style={s.cardBottom}><Text style={s.muted}>{order.date}</Text><Text style={s.amount}>{order.amount}</Text></View>
        {order.status === 'Новый тестовый заказ' && <TouchableOpacity accessibilityRole="button" onPress={() => cancelDemoOrder(order.id)} style={s.cancelButton}>
          <Text style={s.cancelButtonText}>Отменить тестовый заказ</Text>
        </TouchableOpacity>}
      </View>)}
      <Text style={s.section}>История поездок · пример</Text>
      {sampleHistory.map(item => <View key={item.id} style={s.card}>
        <View style={s.cardTop}><Text style={s.cardId}>{item.id}</Text><Text style={[s.status, item.status === 'Завершена' ? s.done : s.cancelled]}>{item.status}</Text></View>
        <Text style={s.routeText}>{item.route}</Text>
        <View style={s.cardBottom}><Text style={s.muted}>{item.date}</Text><Text style={s.amount}>{item.amount}</Text></View>
      </View>)}
      <Text style={s.section}>Заявки водителей · пример</Text>
      {sampleApplications.map((item, i) => <View key={i} style={s.card}>
        <View style={s.appRow}><View style={s.avatar}><Text style={s.avatarText}>{item.name[0]}</Text></View><View style={{ flex: 1 }}><Text style={s.name}>{item.name}</Text><Text style={s.muted}>{item.car}</Text></View></View>
        <Text style={s.review}>{item.status}</Text>
        <Text style={s.mutedSmall}>Демонстрационная карточка. Кнопки одобрения не выполняют действий.</Text>
      </View>)}
      <Text style={s.footer}>LadyGo · Поездки с заботой</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:'#FFF'}, header:{height:66,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderColor:'#F1EAF0'},
  back:{width:38,height:38,borderRadius:13,backgroundColor:'#FFF0F5',alignItems:'center',justifyContent:'center'},backText:{fontSize:30,color:pink,marginTop:-4},
  brand:{fontSize:22,fontWeight:'900',color:pink},sub:{fontSize:10,color:'#817A80',marginTop:1},demoPill:{backgroundColor:'#FFF0F5',paddingHorizontal:10,paddingVertical:6,borderRadius:9},demoText:{fontSize:10,fontWeight:'900',color:pink},
  content:{padding:16,paddingBottom:32},notice:{backgroundColor:'#FFF6FA',borderColor:'#F7D4E2',borderWidth:1,borderRadius:15,padding:13,marginBottom:18},noticeTitle:{fontWeight:'900',color:'#C93670',fontSize:13},noticeText:{color:'#746A71',fontSize:12,lineHeight:18,marginTop:4},
  section:{fontSize:18,fontWeight:'900',color:'#19171B',marginBottom:10,marginTop:8},map:{height:245,borderRadius:20,overflow:'hidden',backgroundColor:'#F4EFF2',marginBottom:14},mapTag:{position:'absolute',left:10,bottom:10,backgroundColor:'#FFFFFFE8',paddingHorizontal:11,paddingVertical:8,borderRadius:11},mapTagText:{fontSize:11,fontWeight:'800',color:'#393239'},
  stats:{flexDirection:'row',gap:8,marginBottom:18},stat:{flex:1,backgroundColor:'#FFF6FA',borderRadius:14,padding:12},statValue:{fontSize:21,fontWeight:'900',color:pink},statLabel:{fontSize:10,color:'#817A80',marginTop:2},
  card:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#F0E9ED',borderRadius:16,padding:14,marginBottom:9},cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},cardId:{fontSize:10,fontWeight:'800',color:'#817A80'},status:{fontSize:10,fontWeight:'800',paddingHorizontal:8,paddingVertical:5,borderRadius:8},done:{backgroundColor:'#EAF7F0',color:'#16845B'},cancelled:{backgroundColor:'#F4F0F2',color:'#817A80'},
  routeText:{fontSize:14,fontWeight:'800',color:'#19171B',marginTop:9},cardBottom:{flexDirection:'row',justifyContent:'space-between',marginTop:10},muted:{fontSize:11,color:'#817A80'},amount:{fontSize:13,fontWeight:'900',color:'#19171B'},
  appRow:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:38,height:38,borderRadius:19,backgroundColor:'#FFF0F5',alignItems:'center',justifyContent:'center'},avatarText:{fontWeight:'900',fontSize:15,color:pink},name:{fontWeight:'900',fontSize:14,color:'#19171B'},review:{alignSelf:'flex-start',marginTop:11,backgroundColor:'#FFF6E8',color:'#98621D',paddingHorizontal:9,paddingVertical:6,borderRadius:8,fontSize:11,fontWeight:'800'},mutedSmall:{fontSize:10,color:'#A69DA3',marginTop:8},
  demoButton:{marginTop:12,backgroundColor:pink,borderRadius:12,paddingVertical:13,alignItems:'center'},demoButtonText:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},
  cancelButton:{marginTop:12,borderWidth:1,borderColor:'#F1C9D8',borderRadius:10,paddingVertical:10,alignItems:'center'},cancelButtonText:{color:'#C93670',fontSize:12,fontWeight:'800'},
  footer:{textAlign:'center',color:'#A69DA3',fontSize:10,marginTop:18},
});
