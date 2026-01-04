import LoginClient from './LoginClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  searchParams?: { [key: string]: string | string[] | undefined }
}

export default function Page({ searchParams }: PageProps) {
  const next =
    typeof searchParams?.next === 'string'
      ? searchParams.next
      : Array.isArray(searchParams?.next)
      ? searchParams?.next[0] ?? '/dashboard'
      : '/dashboard'

  return <LoginClient next={next} />
}
