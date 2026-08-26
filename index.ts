import { registerRootComponent } from 'expo';

import Root from './Root';

// Root, App'i hata yakalayıcıyla sarar (bkz. Root.tsx): release APK'da
// kırmızı hata ekranı olmadığı için hatanın ekranda görünmesi gerekiyor.
// registerRootComponent calls AppRegistry.registerComponent('main', () => Root);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
