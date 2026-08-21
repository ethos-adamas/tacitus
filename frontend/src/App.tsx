import { useIdentitaLocale } from './application/hooks/useIdentitaLocale';
import { useNotifications } from './application/hooks/useNotifications';
import { useRelayConnection } from './application/hooks/useRelayConnection';
import { useTheme } from './application/hooks/useTheme';
import ApplicationView from './ui/ApplicationView';

const App = () => {
  useIdentitaLocale();
  useRelayConnection();
  useTheme();
  useNotifications();

  return <ApplicationView />;
};

export default App;
