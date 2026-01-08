import { supabase } from './supabaseClient';

export type UserSettings = {
  notif_enabled: boolean;
  notify_lead_days: number; // 1/3/7/30
};

export async function getOrCreateUserSettings(): Promise<UserSettings> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error('Not logged in');

  const { data, error } = await supabase
    .from('user_settings')
    .select('notif_enabled, notify_lead_days')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;

  // 없으면 생성
  if (!data) {
    const defaults: UserSettings = { notif_enabled: true, notify_lead_days: 1 };
    const { error: upsertError } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      ...defaults,
    });
    if (upsertError) throw upsertError;
    return defaults;
  }

  return data as UserSettings;
}

export async function updateUserSettings(patch: Partial<UserSettings>) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error('Not logged in');

  const { error } = await supabase
    .from('user_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (error) throw error;
}
