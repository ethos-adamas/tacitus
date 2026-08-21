import { useSelector } from '../../application/store/hooks';
import Conversation from '../conversation/Conversation';
import ConversationList from '../contacts/ConversationList';
import Feedback from '../feedback/Feedback';
import AppHeader from './AppHeader';

const AuthenticatedApplication = () => {
  const conversationOpen = useSelector(
    state => state.conversazioni.idConversazioneAttiva !== undefined,
  );

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
