'use client';

import React from 'react';
import { Rocket, ArrowLeft, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// Shared auth layout wrapper
function AuthLayout({ children, title, description }: { children: React.ReactNode; title: string; description: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Rocket className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold gradient-text">AcquisitionOS</span>
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        {children}
        <p className="text-center text-xs text-muted-foreground mt-6">
          &copy; {new Date().getFullYear()} AcquisitionOS. All rights reserved.
        </p>
      </div>
    </div>
  );
}

// Sign In Page
export function SignInPage() {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <AuthLayout title="Welcome Back" description="Sign in to your AcquisitionOS account">
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signin-email" className="text-xs font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="signin-email" type="email" placeholder="you@example.com" className="pl-9 h-10" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="signin-password" className="text-xs font-medium">Password</Label>
              <button type="button" className="text-xs text-primary hover:text-primary/80 transition-colors">Forgot password?</button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="signin-password" type={showPassword ? 'text' : 'password'} placeholder="Enter password" className="pl-9 pr-9 h-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button className="w-full h-10">Sign In</Button>
          <Separator />
          <Button variant="outline" className="w-full h-10">Continue with Google</Button>
          <p className="text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{' '}
            <button type="button" className="text-primary hover:text-primary/80 font-medium transition-colors">Sign up</button>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

// Sign Up Page
export function SignUpPage() {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <AuthLayout title="Create Account" description="Start your free trial of AcquisitionOS">
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="signup-first" className="text-xs font-medium">First Name</Label>
              <Input id="signup-first" placeholder="John" className="h-10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-last" className="text-xs font-medium">Last Name</Label>
              <Input id="signup-last" placeholder="Doe" className="h-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email" className="text-xs font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="signup-email" type="email" placeholder="you@example.com" className="pl-9 h-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password" className="text-xs font-medium">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="signup-password" type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters" className="pl-9 pr-9 h-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button className="w-full h-10">Create Account</Button>
          <Separator />
          <Button variant="outline" className="w-full h-10">Continue with Google</Button>
          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <button type="button" className="text-primary hover:text-primary/80 font-medium transition-colors">Sign in</button>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

// Forgot Password Page
export function ForgotPasswordPage() {
  return (
    <AuthLayout title="Reset Password" description="Enter your email to receive a reset link">
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forgot-email" className="text-xs font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="forgot-email" type="email" placeholder="you@example.com" className="pl-9 h-10" />
            </div>
          </div>
          <Button className="w-full h-10">Send Reset Link</Button>
          <button type="button" className="flex items-center justify-center gap-1.5 w-full text-xs text-primary hover:text-primary/80 font-medium transition-colors">
            <ArrowLeft className="h-3 w-3" /> Back to Sign In
          </button>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
