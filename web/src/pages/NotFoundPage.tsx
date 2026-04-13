import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-4xl font-semibold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link to="/" className="underline text-primary">
        Back to overview
      </Link>
    </div>
  )
}
