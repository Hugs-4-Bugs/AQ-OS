import { redirect } from 'next/navigation';

export default function AuthSigninPage() {
  redirect('/?auth=signin');
}
