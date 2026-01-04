'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabase/browser'

type Props = { next: string }

export default function LoginClient({ next }: Props) {
  const router = useRouter()

  // supabaseBrowser peut ?f?tre soit un client d?f?j?f? cr?f??f?, soit une fonction (selon ton codebase).
  // Cette ligne marche dans les 2 cas.
  const supabase: any =
    typeof (supabaseBrowser as any) === 'function' ? (supabaseBrowser as any)() : (supabaseBrowser as any)

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        })
        if (error) throw error

        if (!data.session) {
          setMsg('Compte cr?f??f?. V?f?rifie ton email si la confirmation est activ?f?e, puis reconnecte-toi.')
        } else {
          router.push(next)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push(next)
      }
    } catch (err: any) {
      setMsg(err?.message ?? 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-4">
      <h1 className="text-xl font-semibold mb-3">Login</h1>

      <div className="flex gap-2 mb-3">
        <button
          className={'rounded-md px-3 py-2 text-sm border ' + (mode === 'login' ? 'bg-black text-white' : '')}
          type="button"
          onClick={() => setMode('login')}
          disabled={loading}
        >
          Connexion
        </button>
        <button
          className={'rounded-md px-3 py-2 text-sm border ' + (mode === 'signup' ? 'bg-black text-white' : '')}
          type="button"
          onClick={() => setMode('signup')}
          disabled={loading}
        >
          Inscription
        </button>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm">Email</span>
          <input
            className="border rounded-md px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="********"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm">Mot de passe</span>
          <input
            className="border rounded-md px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="********"
          />
        </label>

        {msg && <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>}

        <button className="rounded-md px-3 py-2 bg-black text-white" type="submit" disabled={loading}>
          {loading ? '...' : mode === 'login' ? 'Se connecter' : 'Cr?f?er le compte'}
        </button>

        <button className="text-sm underline" type="button" onClick={() => router.push('/')} disabled={loading}>
          ??? Retour
        </button>
      </form>
    </div>
  )
}
