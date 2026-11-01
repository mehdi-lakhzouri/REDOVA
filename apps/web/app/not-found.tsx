import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { routes } from '@/config/site';

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">The page you are looking for does not exist.</p>
      <Link href={routes.home} className={buttonVariants({ variant: 'outline' })}>
        Back to home
      </Link>
    </main>
  );
}
