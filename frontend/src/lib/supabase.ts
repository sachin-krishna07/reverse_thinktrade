// src/lib/supabase.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

let supabaseClient: SupabaseClient | null = null;
const LS_KEY = "supabase-config";

// ------------------- Config Helpers -------------------

export const getSupabaseConfig = (): SupabaseConfig | null => {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SupabaseConfig;
  } catch (err) {
    console.warn("getSupabaseConfig failed:", err);
    return null;
  }
};

function initClient(config: SupabaseConfig): SupabaseClient {
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, detectSessionInUrl: true },
  });
  supabaseClient = client;
  return client;
}

export const setSupabaseConfig = (config: SupabaseConfig) => {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, JSON.stringify(config));
    }
  } catch (err) {
    console.warn("setSupabaseConfig failed to persist:", err);
  }
  initClient(config);
};

export const removeSupabaseConfig = () => {
  try {
    if (typeof window !== "undefined") localStorage.removeItem(LS_KEY);
  } catch (err) {
    console.warn("removeSupabaseConfig failed:", err);
  }
  supabaseClient = null;
};

export const getSupabaseClient = (): SupabaseClient | null => {
  if (supabaseClient) return supabaseClient;

  const cfg = getSupabaseConfig();
  if (cfg && cfg.url && cfg.anonKey) return initClient(cfg);

  try {
    // @ts-ignore
    const url = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_URL : undefined;
    // @ts-ignore
    const anonKey = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_ANON_KEY : undefined;
    if (url && anonKey) return initClient({ url, anonKey });
  } catch {}

  return null;
};

export const isSupabaseConnected = (): boolean => {
  const cfg = getSupabaseConfig();
  if (cfg && cfg.url && cfg.anonKey) return true;
  try {
    // @ts-ignore
    const url = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_URL : undefined;
    // @ts-ignore
    const anonKey = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_ANON_KEY : undefined;
    return !!(url && anonKey);
  } catch {
    return false;
  }
};

// ------------------- Auth Helpers -------------------

export const subscribeAuth = (cb: (event: string, session: any) => void) => {
  const client = getSupabaseClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((event, session) => {
    try {
      cb(event, session);
    } catch (err) {
      console.error(err);
    }
  });
  return () => {
    try {
      data?.subscription?.unsubscribe?.();
    } catch {}
  };
};

export const signOut = async (): Promise<{ error: any } | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  const { error } = await client.auth.signOut();
  return { error };
};

export const getCurrentUserEmail = async (): Promise<string | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    // Try localStorage first
    const raw = typeof window !== "undefined" ? localStorage.getItem("internAuth") : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.email) return parsed.email;
    }

    // Fallback to Supabase Auth
    const res = await client.auth.getUser();
    return res?.data?.user?.email ?? null;
  } catch (err) {
    console.warn("getCurrentUserEmail failed:", err);
    return null;
  }
};

// ------------------- Type Definitions -------------------

export type MinimalInternProfile = {
  id: string | null;
  name: string | null;
  email: string | null;
  status: string | null;
};

export type FullInternProfile = {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
  bio: string | null;
  phone: string | null;
  domain: string | null;
  github: string | null;
  skills: string[];
  user_id: string | null;
  linkedin: string | null;
  location: string | null;
  projects: any[];
  education: any[];
  languages: string[];
  avatar_url: string | null;
  created_at: string;
  experience: any[];
  started_at: string | null;
  updated_at: string;
  employee_id: string;
  resume_file: string | null;
  availability: string | null;
  certifications: string[];
  certificate_ready: boolean;
};

export type InternProfile = {
  id: string | null;
  user_id?: string | null;
  employee_id?: string | null;
  name: string | null;
  email: string | null;
  phone?: string | null;
  bio?: string | null;
  certificate_ready?: boolean;
  avatar_url?: string | null;
  resume_file?: string | null;
  skills?: string[];
  started_at?: string | null;
  domain?: string | null;
  location?: string | null;
  dob?: string | null;
  linkedin?: string | null;
  github?: string | null;
  education?: any[];
  projects?: any[];
  experience?: any[];
  certifications?: string[];
  languages?: string[];
  availability?: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// ------------------- Profile Fetch Functions -------------------

export async function getInternProfileByEmail(email?: string): Promise<MinimalInternProfile | null> {
  if (!email) return null;
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client not initialized.");

  const normalized = String(email).trim().toLowerCase();
  const { data, error } = await client.rpc("get_intern_profile_by_email", { p_email: normalized });

  if (error) throw error;
  if (!data) return null;

  // RPC returns array of objects in some setups
  const row: any = Array.isArray(data) ? data[0] : data;

  return {
    id: row.id ?? null,
    name: row.name ?? null,
    email: row.email ?? null,
    status: row.status ?? null,
  };
}

export async function getFullInternProfileByEmail(email?: string): Promise<FullInternProfile | null> {
  if (!email) return null;
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase client not initialized");

  const { data, error } = await client.rpc("get_intern_profile_by_email", { p_email: email.toLowerCase() });

  if (error) throw error;
  if (!data) return null;

  const row: any = Array.isArray(data) ? data[0] : data;
  return row as FullInternProfile;
}

// ------------------- Profile Update Functions -------------------

// Use the actual table name from your DB
const TABLE_NAME = "intern_profiles";

/**
 * Robust update helper:
 * - identifier: email or id
 * - tries update by id if identifier looks like an id or opts.byId === true
 * - otherwise updates by email (lowercased), and falls back to id if email attempt errors
 */
export async function updateInternProfile(
  identifier: string,
  updates: Partial<FullInternProfile>,
  opts?: { byId?: boolean }
): Promise<{ success: boolean; data?: any; error?: any }> {
  const client = getSupabaseClient();
  if (!client) {
    const errMsg = "Supabase client not initialized";
    console.warn(errMsg);
    return { success: false, error: errMsg };
  }

  const isLikelyId = opts?.byId || /^[0-9a-fA-F-]{6,}$/.test(String(identifier));
  const updateData = { ...updates, updated_at: new Date().toISOString() };

  try {
    console.info("[DEBUG] updateInternProfile attempt:", { TABLE_NAME, identifier, isLikelyId, updateData });

    // 1) Try by id if identifier looks like an id
    if (isLikelyId) {
      const { data, error } = await client
        .from(TABLE_NAME)
        .update(updateData)
        .eq("id", String(identifier))
        .select()
        .maybeSingle();

      console.info("[DEBUG] update by id response:", { data, error });
      if (error) return { success: false, error };
      return { success: true, data };
    }

    // 2) Otherwise try by email (lowercased)
    const email = String(identifier).toLowerCase();
    const { data, error } = await client
      .from(TABLE_NAME)
      .update(updateData)
      .eq("email", email)
      .select()
      .maybeSingle();

    console.info("[DEBUG] update by email response:", { data, error });

    if (error) {
      // fallback: try by id as a last resort
      console.warn("[DEBUG] update by email produced error, trying id fallback. Error:", error);
      const { data: data2, error: error2 } = await client
        .from(TABLE_NAME)
        .update(updateData)
        .eq("id", identifier)
        .select()
        .maybeSingle();

      console.info("[DEBUG] fallback update by id response:", { data2, error2 });
      if (error2) return { success: false, error: error2 };
      return { success: true, data: data2 };
    }

    return { success: true, data };
  } catch (err) {
    console.error("[DEBUG] updateInternProfile exception:", err);
    try {
      console.error("Error JSON:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    } catch {}
    return { success: false, error: err };
  }
}

/**
 * Update basic information (name, bio, phone, location, domain)
 */
export async function updateBasicInfo(
  email: string,
  basicInfo: {
    name?: string;
    bio?: string;
    phone?: string;
    location?: string;
    domain?: string;
  }
): Promise<{ success: boolean; data?: any; error?: any }> {
  return await updateInternProfile(email, basicInfo);
}

/**
 * Update skills array
 */
export async function updateSkills(
  email: string,
  skills: string[]
): Promise<{ success: boolean; data?: any; error?: any }> {
  return await updateInternProfile(email, { skills });
}

/**
 * Add a skill to existing skills
 */
export async function addSkill(
  email: string,
  skill: string
): Promise<{ success: boolean; data?: any; error?: any }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    const profile = await getFullInternProfileByEmail(email);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const currentSkills = profile.skills || [];
    const newSkills = Array.from(new Set([...currentSkills, skill]));

    return await updateSkills(email, newSkills);
  } catch (err) {
    console.error("Add skill error:", err);
    return { success: false, error: err };
  }
}

/**
 * Remove a skill from existing skills
 */
export async function removeSkill(
  email: string,
  skill: string
): Promise<{ success: boolean; data?: any; error?: any }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "Supabase client not initialized" };
  }

  try {
    const profile = await getFullInternProfileByEmail(email);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const currentSkills = profile.skills || [];
    const newSkills = currentSkills.filter((s) => s !== skill);

    return await updateSkills(email, newSkills);
  } catch (err) {
    console.error("Remove skill error:", err);
    return { success: false, error: err };
  }
}

/**
 * Update experience array
 */
export async function updateExperience(
  email: string,
  experience: any[]
): Promise<{ success: boolean; data?: any; error?: any }> {
  return await updateInternProfile(email, { experience });
}

/**
 * Add new experience
 */
export async function addExperience(
  email: string,
  experienceItem: { title: string; company: string; description: string }
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const profile = await getFullInternProfileByEmail(email);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const currentExperience = profile.experience || [];
    const newExperience = [...currentExperience, experienceItem];

    return await updateExperience(email, newExperience);
  } catch (err) {
    console.error("Add experience error:", err);
    return { success: false, error: err };
  }
}

/**
 * Update specific experience by index
 */
export async function updateExperienceItem(
  email: string,
  index: number,
  experienceItem: { title: string; company: string; description: string }
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const profile = await getFullInternProfileByEmail(email);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const experience = [...(profile.experience || [])];
    if (index < 0 || index >= experience.length) {
      return { success: false, error: "Invalid index" };
    }

    experience[index] = experienceItem;
    return await updateExperience(email, experience);
  } catch (err) {
    console.error("Update experience item error:", err);
    return { success: false, error: err };
  }
}

/**
 * Delete experience by index
 */
export async function deleteExperience(
  email: string,
  index: number
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const profile = await getFullInternProfileByEmail(email);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const experience = profile.experience || [];
    const newExperience = experience.filter((_, i) => i !== index);

    return await updateExperience(email, newExperience);
  } catch (err) {
    console.error("Delete experience error:", err);
    return { success: false, error: err };
  }
}

/**
 * Update projects array
 */
export async function updateProjects(
  email: string,
  projects: any[]
): Promise<{ success: boolean; data?: any; error?: any }> {
  return await updateInternProfile(email, { projects });
}

/**
 * Add new project
 */
export async function addProject(
  email: string,
  projectItem: { name: string; role: string; description: string }
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const profile = await getFullInternProfileByEmail(email);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const currentProjects = profile.projects || [];
    const newProjects = [...currentProjects, projectItem];

    return await updateProjects(email, newProjects);
  } catch (err) {
    console.error("Add project error:", err);
    return { success: false, error: err };
  }
}

/**
 * Update specific project by index
 */
export async function updateProjectItem(
  email: string,
  index: number,
  projectItem: { name: string; role: string; description: string }
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const profile = await getFullInternProfileByEmail(email);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const projects = [...(profile.projects || [])];
    if (index < 0 || index >= projects.length) {
      return { success: false, error: "Invalid index" };
    }

    projects[index] = projectItem;
    return await updateProjects(email, projects);
  } catch (err) {
    console.error("Update project item error:", err);
    return { success: false, error: err };
  }
}

/**
 * Delete project by index
 */
export async function deleteProject(
  email: string,
  index: number
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const profile = await getFullInternProfileByEmail(email);
    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const projects = profile.projects || [];
    const newProjects = projects.filter((_, i) => i !== index);

    return await updateProjects(email, newProjects);
  } catch (err) {
    console.error("Delete project error:", err);
    return { success: false, error: err };
  }
}

/**
 * Update social links (LinkedIn, GitHub)
 */
export async function updateSocialLinks(
  email: string,
  links: { linkedin?: string; github?: string }
): Promise<{ success: boolean; data?: any; error?: any }> {
  return await updateInternProfile(email, links);
}

/**
 * Update avatar URL
 */
export async function updateAvatarUrl(
  email: string,
  avatarUrl: string
): Promise<{ success: boolean; data?: any; error?: any }> {
  return await updateInternProfile(email, { avatar_url: avatarUrl });
}

/**
 * Update resume file URL
 */
export async function updateResumeFile(
  email: string,
  resumeFile: string
): Promise<{ success: boolean; data?: any; error?: any }> {
  return await updateInternProfile(email, { resume_file: resumeFile });
}

// ------------------- Multi-tab support -------------------

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) {
      const cfg = getSupabaseConfig();
      if (cfg && cfg.url && cfg.anonKey) initClient(cfg);
      else supabaseClient = null;
    }
  });
}


// ------------------- Exports (named + default) -------------------

// Provide a named export for callers that want direct client access,
// and also keep a default export for backward compatibility.
export const supabase = getSupabaseClient();
export default supabase;
