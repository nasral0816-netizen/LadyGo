const config = require('./app.json');

const apiKey = process.env.YANDEX_MAPKIT_API_KEY;

if (process.env.EAS_BUILD && !apiKey) {
  throw new Error(
    'YANDEX_MAPKIT_API_KEY is missing. Add it to the EAS preview environment before building.'
  );
}

module.exports = () => ({
  ...config.expo,
  plugins: [
    [
      'expo-yandex-mapkit',
      {
        ...(apiKey ? { apiKey } : {}),
        locale: 'ru_RU',
        flavor: 'full',
        version: '4.42.0'
      }
    ]
  ]
});
