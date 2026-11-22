import React, { useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { MarkerView, Polyline, YandexMapView } from 'expo-yandex-mapkit';

const PICKUP = { latitude: 43.9052, longitude: 42.7168 };
const DESTINATION = { latitude: 43.9091, longitude: 42.7247 };
const ROUTE_POINTS = [
  PICKUP,
  { latitude: 43.9060, longitude: 42.7178 },
  { latitude: 43.9071, longitude: 42.7193 },
  { latitude: 43.9081, longitude: 42.7210 },
  DESTINATION
];
const CAR_STOPS = [
  { latitude: 43.9070, longitude: 42.7190 },
  { latitude: 43.9080, longitude: 42.7210 },
  { latitude: 43.9090, longitude: 42.7230 }
];
const INITIAL_CAMERA = {
  latitude: 43.9070,
  longitude: 42.7200,
  zoom: 15,
  azimuth: 0,
  tilt: 48
};

function Pin({ label, color }) {
  return (
    <View style={[styles.pin, { backgroundColor: color }]}>
      <Text style={styles.pinText}>{label}</Text>
    </View>
  );
}

function MapControl({ label, onPress, accessibilityLabel }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.mapControl}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={styles.mapControlText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [carStep, setCarStep] = useState(0);
  const [camera, setCamera] = useState(INITIAL_CAMERA);
  const [is3D, setIs3D] = useState(true);
  const car = CAR_STOPS[carStep];

  const changeZoom = (delta) => {
    setCamera(current => ({
      ...current,
      zoom: Math.max(10, Math.min(19, current.zoom + delta))
    }));
  };

  const toggle3D = () => {
    setIs3D(current => {
      const next = !current;
      setCamera(position => ({ ...position, tilt: next ? 48 : 0 }));
      return next;
    });
  };

  const resetCamera = () => {
    setIs3D(true);
    setCamera({ ...INITIAL_CAMERA });
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF4F7" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>LadyGo</Text>
          <Text style={styles.subtitle}>Яндекс.Карты · демонстрация</Text>
        </View>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>ДЕМО</Text>
        </View>
      </View>

      <View style={styles.mapWrap}>
        <YandexMapView
          style={StyleSheet.absoluteFill}
          cameraPosition={camera}
          mapType="vector"
          nightMode={false}
          scrollGesturesEnabled
          zoomGesturesEnabled
          rotateGesturesEnabled
          tiltGesturesEnabled
          logo
        >
          <Polyline
            points={ROUTE_POINTS}
            strokeColor="#E84F87"
            strokeWidth={5}
            outlineColor="#FFFFFF"
            outlineWidth={2}
          />
          <MarkerView point={PICKUP} anchor={{ x: 0.5, y: 1 }}>
            <Pin label="А" color="#16845B" />
          </MarkerView>
          <MarkerView point={DESTINATION} anchor={{ x: 0.5, y: 1 }}>
            <Pin label="Б" color="#E84F87" />
          </MarkerView>
          <MarkerView point={car} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.carPin}>
              <Text style={styles.carText}>🚘</Text>
            </View>
          </MarkerView>
        </YandexMapView>

        <View style={styles.mapControls}>
          <MapControl label="+" accessibilityLabel="Приблизить карту" onPress={() => changeZoom(1)} />
          <MapControl label="−" accessibilityLabel="Отдалить карту" onPress={() => changeZoom(-1)} />
          <MapControl label={is3D ? '2D' : '3D'} accessibilityLabel="Переключить вид карты" onPress={toggle3D} />
          <MapControl label="⌖" accessibilityLabel="Вернуть начальный вид" onPress={resetCamera} />
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeading}>
          <Text style={styles.title}>Тестовый маршрут</Text>
          <Text style={styles.step}>Точка машины {carStep + 1}/{CAR_STOPS.length}</Text>
        </View>
        <Text style={styles.note}>
          Маршрут и машина нарисованы по тестовым координатам. Приложение не получает геопозицию людей и не создаёт реальные заказы.
        </Text>
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: '#16845B' }]} />
          <Text style={styles.legend}>Подача</Text>
          <View style={[styles.dot, { backgroundColor: '#E84F87' }]} />
          <Text style={styles.legend}>Маршрут и финиш</Text>
          <View style={[styles.dot, { backgroundColor: '#4778D5' }]} />
          <Text style={styles.legend}>Тестовая машина</Text>
        </View>
        <TouchableOpacity
          style={styles.button}
          onPress={() => setCarStep(current => (current + 1) % CAR_STOPS.length)}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Переместить тестовую машину</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF4F7' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  brand: { color: '#C93670', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#817A80', fontSize: 13, marginTop: 3 },
  demoBadge: { backgroundColor: '#FCE1EB', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 },
  demoBadgeText: { color: '#C93670', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  mapWrap: {
    flex: 1,
    overflow: 'hidden',
    marginHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#E9E6E8'
  },
  mapControls: {
    position: 'absolute',
    right: 12,
    top: 12,
    gap: 8
  },
  mapControl: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3
  },
  mapControlText: { color: '#29242A', fontSize: 19, fontWeight: '700' },
  panel: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 18, gap: 10 },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: '#19171B', fontSize: 18, fontWeight: '700' },
  step: { color: '#C93670', fontSize: 11, fontWeight: '700' },
  note: { color: '#817A80', fontSize: 12, lineHeight: 17 },
  legendRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5, marginLeft: 4 },
  legend: { color: '#514B51', fontSize: 11 },
  button: { backgroundColor: '#E84F87', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  pin: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4
  },
  pinText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  carPin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#4778D5',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4
  },
  carText: { fontSize: 19 }
});
