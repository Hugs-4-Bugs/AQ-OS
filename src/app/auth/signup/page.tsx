import { redirect } from 'next/navigation';

export default function AuthSignupPage() {
  redirect('/?auth=signup');
}
