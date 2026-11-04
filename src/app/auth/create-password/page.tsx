'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Key, ArrowRight, ArrowLeft } from 'lucide-react';

export default function CreatePasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'otp' | 'password'>('otp');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const sendOtp = async () => {
    setError(''); setLoading(true);
    try {
      await fetch('/api/auth/otp/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ email }),
      });
      setOtpSent(true);
    } catch { setError('Failed to send verification code'); }
    setLoading(false);
  };

  const setPassword = async () => {
    setError('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) { router.push('/auth/mfa-enrollment'); }
      else { setError(data.error || 'Failed to set password'); }
    } catch { setError('Network error'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Key className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Create Your Password</h1>
          <p className="text-sm text-muted-foreground">Set a password using email verification.</p>
        </div>
        {error && <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600">{error}</div>}
        {step === 'otp' && (
          <Card><CardContent className="space-y-4 p-6">
            <div><label className="text-xs text-muted-foreground mb-1 block">Email Address</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" /></div>
            <Button onClick={sendOtp} disabled={!email || loading} className="w-full">{loading ? 'Sending...' : 'Send Verification Code'} <ArrowRight className="ml-2 h-4 w-4" /></Button>
            {otpSent && (<>
              <div className="pt-2"><label className="text-xs text-muted-foreground mb-1 block">Enter 6-digit code</label>
                <Input inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="text-center text-xl tracking-widest font-mono" /></div>
              <Button onClick={() => otp.length === 6 && setStep('password')} disabled={otp.length !== 6} className="w-full">Verify Code <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </>)}
          </CardContent></Card>
        )}
        {step === 'password' && (
          <Card><CardContent className="space-y-4 p-6">
            <div><label className="text-xs text-muted-foreground mb-1 block">New Password (min 8 chars)</label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="********" /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Confirm Password</label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="********" /></div>
            <Button onClick={setPassword} disabled={!newPassword || !confirmPassword || loading} className="w-full">{loading ? 'Setting...' : 'Set Password'} <ArrowRight className="ml-2 h-4 w-4" /></Button>
            <Button variant="ghost" onClick={() => setStep('otp')} className="w-full"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
          </CardContent></Card>
        )}
        <div className="text-center">
          <Button variant="link" onClick={() => router.push('/auth/mfa-enrollment')} className="text-xs text-muted-foreground">Back to MFA Enrollment</Button>
        </div>
      </div>
    </div>
  );
}
