const config = require('./app.json');

module.exports = () => ({
  ...config.expo,
  plugins: [
    [
      'expo-yandex-mapkit',
      {
        apiKey: process.env.YANDEX_MAPKIT_API_KEY,
        locale: 'ru_RU',
        flavor: 'lite'
      }
    ]
  ]
});
