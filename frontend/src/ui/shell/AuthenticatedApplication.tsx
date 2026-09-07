import { useEffect } from 'react';
import { useSelector } from '../../application/store/hooks';
import Conversation from '../conversation/Conversation';
import ConversationList from '../contacts/ConversationList';
import Feedback from '../feedback/Feedback';
import AppHeader from './AppHeader';
import { usePhotoDropProtection } from '../kit/PhotoDropzone';

const AuthenticatedApplication = () => {
  usePhotoDropProtection();
  const conversationOpen = useSelector(
    state => state.conversazioni.idConversazioneAttiva !== undefined,
  );

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      document.documentElement.style.setProperty(
        '--viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      document.documentElement.style.setProperty(
        '--viewport-top',
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      document.documentElement.style.removeProperty('--viewport-height');
      document.documentElement.style.removeProperty('--viewport-top');
    };
  }, []);

  return (
    <main className="app-shell">
      <AppHeader />
      <Feedback />
      <section
        className={`layout ${conversationOpen ? 'conversation-open' : ''}`}>
        <ConversationList />
        <Conversation />
      </section>
    </main>
  );
};

export default AuthenticatedApplication;
