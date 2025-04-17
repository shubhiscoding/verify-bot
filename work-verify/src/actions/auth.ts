'use server'

import { signIn ,signOut } from "@//auth"

export async function signInAuth() {
  return await signIn('discord')
}

export async function signOutAuth() {
  await signOut({ redirectTo: '/vault' })
}