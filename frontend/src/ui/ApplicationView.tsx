import { useSelector } from '../application/store/hooks';
import AuthenticatedApplication from './shell/AuthenticatedApplication';
import IdentitySetup from './identity/IdentitySetup';

const LoadingView = () => (
  <main className="landing">
    <p>Caricamento…</p>
  </main>
);

const ApplicationView = () => {
  const identita = useSelector(state => state.identitaLocale);

  if (identita.stato === 'caricamento') return <LoadingView />;
  if (identita.stato === 'assente') return <IdentitySetup />;
  return <AuthenticatedApplication />;
};

export default ApplicationView;
