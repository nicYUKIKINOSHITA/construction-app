import { supabase } from './supabase';
import { SUB_STEPS_12 } from './constants';

/**
 * Create all 17 check rows for a new item.
 * Steps 1-11: one row each (sub_step = null)
 * Step 12: one row per sub-step (6 rows)
 */
export async function createChecksForItem(itemId: string) {
  const rows = [];

  // Steps 1-11
  for (let step = 1; step <= 11; step++) {
    rows.push({
      item_id: itemId,
      step_number: step,
      sub_step: null,
      checked: false,
    });
  }

  // Step 12 sub-steps
  for (const sub of SUB_STEPS_12) {
    rows.push({
      item_id: itemId,
      step_number: 12,
      sub_step: sub.subStep,
      checked: false,
    });
  }

  const { error } = await supabase.from('checks').insert(rows);
  if (error) throw error;
}
