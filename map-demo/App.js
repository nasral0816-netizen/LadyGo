import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MarkerView, YandexMapView } from 'expo-yandex-mapkit';

const PICKUP = { latitude: 43.9052, longitude: 42.7168 };
const DESTINATION = { latitude: 43.9091, longitude: 42.7247 };
const CAR_STOPS = [
  { latitude: 43.9070, longitude: 42.7190 },
  { latitude: 43.9080, longitude: 42.7210 },
  { latitude: 43.9090, longitude: 42.7230 }
];

function Pin({ label, color }) {
  return (
    <View style={[styles.pin, { backgroundColor: color }]}>
      <Text style={styles.pinText}>{label}</Text>
    </View>
  );
}

export default function App() {
  const [carStep, setCarStep] = useState(0);
  const car = CAR_STOPS[carStep];

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4F7" />
      <View style={styles.header}>
        <Text style={styles.brand}>LadyGo</Text>
        <Text style={styles.subtitle}>Демонстрация Яндекс.Карт</Text>
      </View>

      <View style={styles.mapWrap}>
        <YandexMapView
          style={StyleSheet.absoluteFill}
          cameraPosition={{ latitude: 43.9070, longitude: 42.7200, zoom: 15 }}
        >
          <MarkerView point={PICKUP} anchor={{ x: 0.5, y: 1 }}>
            <Pin label="А" color="#16845B" />
          </MarkerView>
          <MarkerView point={DESTINATION} anchor={{ x: 0.5, y: 1 }}>
            <Pin label="Б" color="#E84F87" />
          </MarkerView>
          <MarkerView point={car} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.carPin}><Text style={styles.carText}>🚘</Text></View>
          </MarkerView>
        </YandexMapView>
      </View>

      <View style={styles.panel}>
        <Text style={styles.title}>Тестовая поездка</Text>
        <Text style={styles.note}>Все точки на этой карте демонстрационные. Геолокация людей и реальные заказы не используются.</Text>
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: '#16845B' }]} />
          <Text style={styles.legend}>Подача</Text>
          <View style={[styles.dot, { backgroundColor: '#E84F87' }]} />
          <Text style={styles.legend}>Назначение</Text>
          <View style={[styles.dot, { backgroundColor: '#4778D5' }]} />
          <Text style={styles.legend}>Тестовая машина</Text>
        </View>
        <TouchableOpacity style={styles.button} onPress={() => setCarStep((carStep + 1) % CAR_STOPS.length)}>
          <Text style={styles.buttonText}>Переместить тестовую машину</Text>
        </TouchableOpacity>
        <Text style={styles.counter}>Шаг симуляции: {carStep + 1} / {CAR_STOPS.length}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF4F7' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  brand: { color: '#C93670', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#817A80', fontSize: 13, marginTop: 3 },
  mapWrap: { flex: 1, overflow: 'hidden', marginHorizontal: 12, borderRadius: 20, backgroundColor: '#EEE' },
  panel: { padding: 18, gap: 10 },
  title: { color: '#19171B', fontSize: 18, fontWeight: '700' },
  note: { color: '#817A80', fontSize: 12, lineHeight: 17 },
  legendRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5, marginLeft: 4 },
  legend: { color: '#514B51', fontSize: 11 },
  button: { backgroundColor: '#E84F87', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  counter: { color: '#817A80', textAlign: 'center', fontSize: 11 },
  pin: { minWidth: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  pinText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  carPin: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#4778D5', borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  carText: { fontSize: 19 }
});
