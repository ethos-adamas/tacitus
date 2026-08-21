import type { TacitusId } from '../../domain/tacitusId';
import { useSelector } from '../store/hooks';

export const useSessioniSicure = (tacitusId: TacitusId) =>
  useSelector(state => state.sessioniSicure[tacitusId]);
