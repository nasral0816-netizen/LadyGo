import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import {
  findDrivingRoutes,
  MarkerView,
  Polyline,
  searchText,
  YandexMapView
} from 'expo-yandex-mapkit';

const PICKUP = { latitude: 43.9052, longitude: 42.7168 };
const INITIAL_DESTINATION = { latitude: 43.9091, longitude: 42.7247 };
const INITIAL_ROUTE = [
  PICKUP,
  { latitude: 43.9060, longitude: 42.7178 },
  { latitude: 43.9071, longitude: 42.7193 },
  { latitude: 43.9081, longitude: 42.7210 },
  INITIAL_DESTINATION
];
const CAR_STOPS = [
  { latitude: 43.9070, longitude: 42.7190 },
  { latitude: 43.9080, longitude: 42.7210 },
  { latitude: 43.9090, longitude: 42.7230 }
];
const KISLOVODSK_BOUNDS = {
  southWest: { latitude: 43.88, longitude: 42.68 },
  northEast: { latitude: 43.94, longitude: 42.77 }
};
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
  const [destination, setDestination] = useState(INITIAL_DESTINATION);
  const [routePoints, setRoutePoints] = useState(INITIAL_ROUTE);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [routeError, setRouteError] = useState('');
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

  const searchAddress = async () => {
    const text = query.trim();
    if (text.length < 3 || searching) {
      setSearchError(text.length < 3 ? 'Введи хотя бы 3 символа.' : '');
      return;
    }

    setSearching(true);
    setSearchError('');
    setRouteError('');
    setResults([]);
    try {
      const found = await searchText(text, {
        boundingBox: KISLOVODSK_BOUNDS,
        searchTypes: ['geo'],
        resultPageSize: 5,
        zoom: 15
      });
      const usable = (found || []).filter(item =>
        item.point &&
        Number.isFinite(Number(item.point.latitude)) &&
        Number.isFinite(Number(item.point.longitude))
      );
      setResults(usable);
      if (!usable.length) setSearchError('Ничего не найдено. Уточни улицу или номер дома.');
    } catch (error) {
      setSearchError('Поиск временно недоступен. Проверь ключ MapKit и подключение.');
    } finally {
      setSearching(false);
    }
  };

  const chooseAddress = async (item) => {
    const point = {
      latitude: Number(item.point.latitude),
      longitude: Number(item.point.longitude)
    };
    setDestination(point);
    setResults([]);
    setSearchError('');
    setQuery(item.formattedAddress || item.name || item.description || 'Выбранный адрес');
    setCamera(current => ({
      ...current,
      latitude: (PICKUP.latitude + point.latitude) / 2,
      longitude: (PICKUP.longitude + point.longitude) / 2,
      zoom: 14
    }));

    try {
      const routes = await findDrivingRoutes([PICKUP, point]);
      if (routes?.[0]?.points?.length > 1) {
        setRoutePoints(routes[0].points);
        setRouteError('');
      } else {
        setRoutePoints([PICKUP, point]);
        setRouteError('Маршрут не найден — показана прямая линия между точками.');
      }
    } catch (error) {
      setRoutePoints([PICKUP, point]);
      setRouteError('Не удалось построить маршрут. Показана прямая линия между точками.');
    }
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

      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Найти адрес в Кисловодске"
          placeholderTextColor="#9B9299"
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={searchAddress}
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.searchButton, searching && styles.searchButtonDisabled]}
          onPress={searchAddress}
          disabled={searching}
          activeOpacity={0.85}
        >
          {searching
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={styles.searchButtonText}>Найти</Text>}
        </TouchableOpacity>
      </View>

      {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}
      {results.length > 0 ? (
        <View style={styles.resultsBox}>
          {results.slice(0, 4).map((item, index) => (
            <TouchableOpacity
              key={String(item.name || item.formattedAddress || index) + index}
              style={styles.resultItem}
              onPress={() => chooseAddress(item)}
            >
              <Text style={styles.resultTitle} numberOfLines={1}>
                {item.name || item.formattedAddress || 'Найденное место'}
              </Text>
              {!!item.description && (
                <Text style={styles.resultDescription} numberOfLines={1}>{item.description}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

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
          maxZoom={19}
          minZoom={10}
        >
          {routePoints.length > 1 ? (
            <Polyline
              points={routePoints}
              strokeColor="#E84F87"
              strokeWidth={5}
              outlineColor="#FFFFFF"
              outlineWidth={2}
            />
          ) : null}
          <MarkerView point={PICKUP} anchor={{ x: 0.5, y: 1 }}>
            <Pin label="А" color="#16845B" />
          </MarkerView>
          <MarkerView point={destination} anchor={{ x: 0.5, y: 1 }}>
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
          <Text style={styles.step}>Машина {carStep + 1}/{CAR_STOPS.length}</Text>
        </View>
        <Text style={styles.note}>
          Точки и машина демонстрационные. Реальные заказы и геопозиция людей не используются.
        </Text>
        {routeError ? <Text style={styles.routeError}>{routeError}</Text> : null}
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: '#16845B' }]} />
          <Text style={styles.legend}>Подача</Text>
          <View style={[styles.dot, { backgroundColor: '#E84F87' }]} />
          <Text style={styles.legend}>Маршрут</Text>
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
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  brand: { color: '#C93670', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#817A80', fontSize: 13, marginTop: 3 },
  demoBadge: { backgroundColor: '#FCE1EB', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 },
  demoBadgeText: { color: '#C93670', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  searchBox: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 5,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2
  },
  searchInput: { flex: 1, minHeight: 42, paddingHorizontal: 11, color: '#19171B', fontSize: 14 },
  searchButton: { backgroundColor: '#E84F87', borderRadius: 11, minWidth: 66, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchButtonDisabled: { opacity: 0.65 },
  searchButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  errorText: { color: '#B4234A', fontSize: 12, marginHorizontal: 18, marginBottom: 6 },
  resultsBox: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    elevation: 2
  },
  resultItem: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1E9ED' },
  resultTitle: { color: '#29242A', fontSize: 13, fontWeight: '700' },
  resultDescription: { color: '#817A80', fontSize: 11, marginTop: 2 },
  mapWrap: {
    flex: 1,
    minHeight: 220,
    overflow: 'hidden',
    marginHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#E9E6E8'
  },
  mapControls: { position: 'absolute', right: 12, top: 12, gap: 8 },
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
  panel: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, gap: 8 },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: '#19171B', fontSize: 17, fontWeight: '700' },
  step: { color: '#C93670', fontSize: 11, fontWeight: '700' },
  note: { color: '#817A80', fontSize: 11, lineHeight: 15 },
  routeError: { color: '#9B5A24', fontSize: 11 },
  legendRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 5, marginLeft: 4 },
  legend: { color: '#514B51', fontSize: 10 },
  button: { backgroundColor: '#E84F87', borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
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
