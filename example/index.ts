import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

import App from './App';

// The app itself uses react-native-safe-area-context; this deprecation warning is raised
// by a transitive dependency touching the legacy export on RN 0.86.
LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

registerRootComponent(App);
