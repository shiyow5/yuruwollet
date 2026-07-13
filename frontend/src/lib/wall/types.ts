import type { Tables, Enums } from '../database.types';

export type Checkpoint = Tables<'balance_checkpoints'>;
export type CheckpointStatus = Enums<'checkpoint_status'>;
