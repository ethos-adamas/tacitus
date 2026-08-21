import { useEffect } from 'react';
import {
  avvisoNascosto,
  erroreNascosto,
} from '../../application/store/feedbackSlice';
import { useDispatch, useSelector } from '../../application/store/hooks';

const Feedback = () => {
  const dispatch = useDispatch();
  const feedback = useSelector(state => state.feedback);

  const hideError = () => dispatch(erroreNascosto());

  useEffect(() => {
    if (!feedback.avviso) return;
    const timer = window.setTimeout(() => dispatch(avvisoNascosto()), 2_000);
    return () => clearTimeout(timer);
  }, [dispatch, feedback.avviso]);

  return (
    <>
      {feedback.errore && (
        <p className="toast" role="alert">
          {feedback.errore}
          <button onClick={hideError}>×</button>
        </p>
      )}
      {feedback.avviso && (
        <p className="toast success" role="status">
          {feedback.avviso}
        </p>
      )}
    </>
  );
};

export default Feedback;
