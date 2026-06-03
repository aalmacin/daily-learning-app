'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export async function signIn(formData: FormData) {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  });

  if (error) {
    if (error.message.includes('Email not confirmed')) {
      redirect('/login?error=Account+pending+admin+approval.');
    }
    redirect('/login?error=Invalid+credentials');
  }

  redirect('/');
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function setPassword(formData: FormData) {
  const password = formData.get('password') as string;
  const confirm = formData.get('confirm') as string;

  if (!password || password.length < 8) {
    redirect('/set-password?error=Password+must+be+at+least+8+characters');
  }
  if (password !== confirm) {
    redirect('/set-password?error=Passwords+do+not+match');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect('/set-password?error=' + encodeURIComponent(error.message));
  }

  redirect('/');
}

export async function signUp(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const confirm = formData.get('confirm') as string;

  if (!email) {
    redirect('/register?error=Email+is+required');
  }
  if (!password || password.length < 8) {
    redirect('/register?error=Password+must+be+at+least+8+characters');
  }
  if (password !== confirm) {
    redirect('/register?error=Passwords+do+not+match');
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });

  if (error) {
    redirect('/register?error=' + encodeURIComponent(error.message));
  }

  redirect('/login?info=Account+created.+Pending+admin+approval.');
}
