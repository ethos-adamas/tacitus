export const copyTacitusId = (tacitusId: string): Promise<void> =>
  navigator.clipboard.writeText(tacitusId);
