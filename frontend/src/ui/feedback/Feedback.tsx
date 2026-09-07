import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  avvisoNascosto,
  erroreNascosto,
} from '../../application/store/feedbackSlice';
import { useDispatch, useSelector } from '../../application/store/hooks';
import { Button } from '../kit/Button';

const Feedback = () => {
  const dispatch = useDispatch();
  const feedback = useSelector(state => state.feedback);

  const hideError = () => dispatch(erroreNascosto());

  useEffect(() => {
    if (!feedback.avviso) return;
    const timer = window.setTimeout(() => dispatch(avvisoNascosto()), 2_000);
    return () => clearTimeout(timer);
  }, [dispatch, feedback.avviso]);

  return createPortal(
    <>
      {feedback.errore && (
        <p className="toast" role="alert">
          {feedback.errore}
          <Button
            variant="ghost"
            aria-label="Chiudi errore"
            onClick={hideError}>
            ×
          </Button>
        </p>
      )}
      {feedback.avviso && (
        <p className="toast success" role="status">
          {feedback.avviso}
        </p>
      )}
    </>,
    document.body,
  );
};

export default Feedback;
