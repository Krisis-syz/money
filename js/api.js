// Supabase 配置
const SUPABASE_URL = 'https://wcstsltmdcmenxkepyzk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjc3RzbHRtZGNtZW54a2VweXprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNjI4MTAsImV4cCI6MjEwMDYzODgxMH0.Hx6nJlZwcCyML7DaqDUUNRx-Po6K6bd6At6PeDVWJ5Q';

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return supabaseClient;
  }
  if (window.createClient) {
    supabaseClient = window.createClient(SUPABASE_URL, SUPABASE_KEY);
    return supabaseClient;
  }
  return null;
}

function waitForSupabase() {
  return new Promise((resolve) => {
    if (getSupabase()) { resolve(); return; }
    const check = () => {
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        resolve();
        return;
      }
      setTimeout(check, 100);
    };
    check();
    setTimeout(() => { if (!supabaseClient) console.error('Supabase SDK 加载超时'); resolve(); }, 10000);
  });
}

// ============ Auth ============
async function getCurrentUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function signUp(email, password) {
  await waitForSupabase();
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('该邮箱已注册');
  return { user: data.user, needsConfirmation: data.user && data.user.identities && data.user.identities.length > 0 && !data.session };
}

async function signIn(email, password) {
  await waitForSupabase();
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await waitForSupabase();
  const sb = getSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
  window.location.href = 'login.html';
}

async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) { window.location.href = 'login.html'; return false; }
  return true;
}

// ============ 资金管理 API ============
const fundApi = {
  getSources: async () => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb.from('fund_sources').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  addSource: async (name, type, icon) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb.from('fund_sources').insert({ name, type: type || '流动', icon: icon || 'fa-solid fa-wallet', user_id: user.id }).select().single();
    if (error) throw error;
    return data;
  },

  deleteSource: async (id) => {
    const sb = getSupabase();
    const { error } = await sb.from('fund_sources').delete().eq('id', id);
    if (error) throw error;
  },

  updateSource: async (id, name, type) => {
    const sb = getSupabase();
    const { error } = await sb.from('fund_sources').update({ name, type }).eq('id', id);
    if (error) throw error;
  },

  getRecords: async (yearMonth) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb.from('fund_records').select('*, fund_sources(name)').eq('user_id', user.id).eq('year_month', yearMonth);
    if (error) throw error;
    return (data || []).map(r => ({ id: r.id, sourceId: r.source_id, sourceName: r.fund_sources?.name || '未知', amount: r.amount }));
  },

  saveRecords: async (yearMonth, records) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const rows = records.map(r => ({ user_id: user.id, source_id: r.sourceId, year_month: yearMonth, amount: r.amount }));
    const { error } = await sb.from('fund_records').upsert(rows, { onConflict: 'user_id,source_id,year_month' });
    if (error) throw error;
  },

  getAllRecords: async () => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb.from('fund_records').select('year_month, amount, source_id, fund_sources(name)').eq('user_id', user.id).order('year_month', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => ({ yearMonth: r.year_month, amount: r.amount, sourceId: r.source_id, sourceName: r.fund_sources?.name || '未知' }));
  },

  checkMonthRecorded: async (yearMonth) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { count, error } = await sb.from('fund_records').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('year_month', yearMonth);
    if (error) throw error;
    return count > 0;
  },

  getReport: async (yearMonth) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb.from('fund_reports').select('*').eq('user_id', user.id).eq('year_month', yearMonth).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  getReports: async () => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb.from('fund_reports').select('*').eq('user_id', user.id).order('year_month', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  generateReport: async (yearMonth) => {
    const sb = getSupabase();
    const user = await getCurrentUser();
    const { data, error } = await sb.functions.invoke('generate-fund-report', { body: { user_id: user.id, year_month: yearMonth } });
    if (error) throw error;
    return data;
  }
};
