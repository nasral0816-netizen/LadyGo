import React from 'react';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';
import LadyGoApp from './src/LadyGoApp';

class LadyGoErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('LadyGo startup/render error:', error, info?.componentStack || '');
  }

  render() {
    if (this.state.error) {
      const details = String(this.state.error?.stack || this.state.error?.message || this.state.error);
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F0E4', padding: 22 }}>
          <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
            <Text style={{ color: '#176344', fontSize: 30, fontWeight: '900' }}>LadyGo</Text>
            <Text style={{ color: '#1F2923', fontSize: 20, fontWeight: '800' }}>Не удалось открыть экран</Text>
            <Text style={{ color: '#756F63', fontSize: 13 }}>Ошибка отображена ниже. Передай этот текст разработчику для точного исправления.</Text>
            <ScrollView style={{ maxHeight: '55%', backgroundColor: '#FFFCF6', borderRadius: 12, padding: 12 }}>
              <Text selectable style={{ color: '#1F2923', fontSize: 12 }}>{details}</Text>
            </ScrollView>
          </View>
        </SafeAreaView>
      );
    }
    return <LadyGoApp />;
  }
}

export default function App() {
  return <LadyGoErrorBoundary />;
}
