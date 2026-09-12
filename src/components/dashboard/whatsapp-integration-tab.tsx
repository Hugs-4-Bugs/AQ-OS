"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Phone,
  Send,
  Check,
  CheckCheck,
  Clock,
  Settings,
  RefreshCw,
  Globe,
  Users,
  Shield,
  Zap,
  ToggleLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ConnectionStatus = "connected" | "disconnected" | "connecting";

interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  category: "marketing" | "utility" | "authentication";
  status: "approved" | "pending";
}

interface AutomationConfig {
  autoReply: boolean;
  autoReplyDelay: string;
  awayMessageEnabled: boolean;
  awayMessage: string;
  businessHoursEnabled: boolean;
  businessStart: string;
  businessEnd: string;
  timezone: string;
  activeDays: string[];
  leadMatching: boolean;
  spamProtection: boolean;
}

interface ActivityEntry {
  id: string;
  direction: "sent" | "received" | "failed";
  contact: string;
  preview: string;
  time: string;
}

interface DailyVolume {
  day: string;
  sent: number;
  received: number;
}



const COUNTRY_CODES = [
  { code: "+1", label: "US (+1)" },
  { code: "+44", label: "UK (+44)" },
  { code: "+49", label: "DE (+49)" },
  { code: "+33", label: "FR (+33)" },
  { code: "+91", label: "IN (+91)" },
  { code: "+55", label: "BR (+55)" },
  { code: "+61", label: "AU (+61)" },
  { code: "+86", label: "CN (+86)" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Kolkata",
];

const AUTO_REPLY_DELAYS = [
  { value: "1m", label: "1 minute" },
  { value: "5m", label: "5 minutes" },
  { value: "15m", label: "15 minutes" },
  { value: "30m", label: "30 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "custom", label: "Custom" },
];

// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/60",
        className
      )}
    />
  );
}

function ConnectionSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonPulse className="h-28 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SkeletonPulse className="h-24 w-full" />
        <SkeletonPulse className="h-24 w-full" />
      </div>
      <SkeletonPulse className="h-48 w-full" />
      <SkeletonPulse className="h-12 w-full" />
    </div>
  );
}

function TemplatesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonPulse key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function AutomationSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonPulse key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonPulse key={i} className="h-24 w-full" />
        ))}
      </div>
      <SkeletonPulse className="h-64 w-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WhatsAppIntegrationTab() {
  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState("connection");

  // Connection
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [countryCode, setCountryCode] = useState("+1");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<
    "Excellent" | "Good" | "Poor" | "N/A"
  >("N/A");

  // Templates
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>([]);

  // Automation
  const [automation, setAutomation] = useState<AutomationConfig>({
    autoReply: false,
    autoReplyDelay: "5m",
    awayMessageEnabled: false,
    awayMessage:
      "Thanks for reaching out! We're currently away but will get back to you during business hours.",
    businessHoursEnabled: true,
    businessStart: "09:00",
    businessEnd: "17:00",
    timezone: "America/New_York",
    activeDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    leadMatching: true,
    spamProtection: true,
  });

  // Show loading skeleton briefly on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // ---- Handlers ----

  const handleConnect = useCallback(async () => {
    if (!phoneNumber.trim()) {
      toast.error("Please enter a business phone number");
      return;
    }
    setConnectionStatus("connecting");
    await new Promise((r) => setTimeout(r, 2500));
    setConnectionStatus("connected");
    setConnectionQuality("Excellent");
    toast.success("WhatsApp Business account connected successfully!");
  }, [phoneNumber]);

  const handleDisconnect = useCallback(async () => {
    setConnectionStatus("connecting");
    await new Promise((r) => setTimeout(r, 1200));
    setConnectionStatus("disconnected");
    setConnectionQuality("N/A");
    toast.success("WhatsApp disconnected");
  }, []);

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    await new Promise((r) => setTimeout(r, 2000));
    const q: "Excellent" | "Good" | "Poor" = "Excellent";
    setConnectionQuality(q);
    setIsTesting(false);
    toast.success(`Connection quality: ${q}`);
  }, []);

  const handleUpdateAutomation = useCallback(
    <K extends keyof AutomationConfig>(key: K, value: AutomationConfig[K]) => {
      setAutomation((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleToggleDay = useCallback((day: string) => {
    setAutomation((prev) => ({
      ...prev,
      activeDays: prev.activeDays.includes(day)
        ? prev.activeDays.filter((d) => d !== day)
        : [...prev.activeDays, day],
    }));
  }, []);

  // ---- Helpers ----

  const qualityColor: Record<string, string> = {
    Excellent: "text-green-400 bg-green-500/10 border-green-500/20",
    Good: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    Poor: "text-red-400 bg-red-500/10 border-red-500/20",
    "N/A": "text-muted-foreground bg-muted border-border/30",
  };

  const activityColor: Record<string, string> = {
    sent: "text-green-400 bg-green-500/10 border-green-500/20",
    received: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    failed: "text-red-400 bg-red-500/10 border-red-500/20",
  };

  const activityIcon: Record<string, React.ReactNode> = {
    sent: <CheckCheck className="h-4 w-4 text-green-400" />,
    received: <MessageCircle className="h-4 w-4 text-blue-400" />,
    failed: <Zap className="h-4 w-4 text-red-400" />,
  };

  const categoryBadge: Record<string, string> = {
    marketing: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    utility: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    authentication: "bg-green-500/10 text-green-400 border-green-500/20",
  };

  const maxDaily = dailyVolume.length > 0
    ? Math.max(...dailyVolume.map((d) => Math.max(d.sent, d.received)), 1)
    : 1;

  // ---- Render ----

  return (
    <div className="space-y-6 p-1">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 border border-border/50 p-1 w-full sm:w-auto">
          <TabsTrigger value="connection" className="gap-2 text-xs">
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Connection</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 text-xs">
            <MessageCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="automation" className="gap-2 text-xs">
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Automation</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 text-xs">
            <Globe className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
        </TabsList>

        {/* ================================================================
            TAB 1 — Connection Status
        ================================================================ */}
        <TabsContent value="connection" className="mt-4">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="skeleton-connection"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <ConnectionSkeleton />
              </motion.div>
            ) : (
              <motion.div
                key="content-connection"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4"
              >
                {/* Status Card */}
                <Card className="bg-muted/30 border-border/50 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Phone className="h-5 w-5 text-green-400" />
                      Connection Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Status Indicator */}
                    <div
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-xl border transition-colors",
                        connectionStatus === "connected"
                          ? "bg-green-500/5 border-green-500/20"
                          : connectionStatus === "connecting"
                            ? "bg-amber-500/5 border-amber-500/20"
                            : "bg-muted/50 border-border/50"
                      )}
                    >
                      <div className="relative">
                        <div
                          className={cn(
                            "h-3 w-3 rounded-full",
                            connectionStatus === "connected"
                              ? "bg-green-400"
                              : connectionStatus === "connecting"
                                ? "bg-amber-400"
                                : "bg-muted-foreground"
                          )}
                        />
                        {connectionStatus === "connected" && (
                          <div className="absolute inset-0 h-3 w-3 rounded-full bg-green-400 animate-ping opacity-60" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold capitalize">
                          {connectionStatus === "connected"
                            ? "Connected"
                            : connectionStatus === "connecting"
                              ? "Connecting..."
                              : "Disconnected"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {connectionStatus === "connected"
                            ? "WhatsApp Business API is live and receiving messages"
                            : connectionStatus === "connecting"
                              ? "Establishing connection to WhatsApp servers..."
                              : "Connect your business number to start messaging"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "border",
                          connectionStatus === "connected"
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : connectionStatus === "connecting"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "text-muted-foreground"
                        )}
                      >
                        {connectionStatus === "connecting" && (
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        )}
                        {connectionStatus}
                      </Badge>
                    </div>

                    {/* Business Phone Number */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Business Phone Number</p>
                      <div className="flex gap-2">
                        <select
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value)}
                          className="bg-muted/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                        >
                          {COUNTRY_CODES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <Input
                          placeholder="(555) 123-4567"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="flex-1 bg-muted/50 border-border/50"
                          disabled={connectionStatus === "connected"}
                        />
                      </div>
                    </div>

                    {/* QR Code Placeholder */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        WhatsApp QR Code
                      </p>
                      <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed border-border/50 bg-muted/20 transition-colors hover:border-border/80">
                        <div className="text-center">
                          <MessageCircle className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                          <p className="text-sm text-muted-foreground/60">
                            Scan QR code with WhatsApp Business
                          </p>
                          <p className="text-xs text-muted-foreground/40 mt-1">
                            or enter phone number above
                          </p>
                        </div>
                      </div>
                    </div>

                    <Separator className="bg-border/30" />

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      {connectionStatus !== "connected" ? (
                        <Button
                          onClick={handleConnect}
                          disabled={
                            !phoneNumber.trim() ||
                            connectionStatus === "connecting"
                          }
                          className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white"
                        >
                          {connectionStatus === "connecting" ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Phone className="h-4 w-4 mr-2" />
                              Connect WhatsApp
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          onClick={handleDisconnect}
                          disabled={connectionStatus === "connecting"}
                          variant="outline"
                          className="flex-1 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        >
                          {connectionStatus === "connecting" ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Disconnecting...
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="h-4 w-4 mr-2" />
                              Disconnect
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        onClick={handleTestConnection}
                        disabled={
                          isTesting || connectionStatus !== "connected"
                        }
                        variant="outline"
                        className="flex-1 border-border/50"
                      >
                        {isTesting ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4 mr-2" />
                            Test Connection
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Connection Quality */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                      <div className="flex items-center gap-2 text-sm">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Connection Quality
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("border", qualityColor[connectionQuality])}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        {connectionQuality}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        {/* ================================================================
            TAB 2 — Message Templates
        ================================================================ */}
        <TabsContent value="templates" className="mt-4">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="skeleton-templates"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <TemplatesSkeleton />
              </motion.div>
            ) : (
              <motion.div
                key="content-templates"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4"
              >
                <Card className="bg-muted/30 border-border/50 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MessageCircle className="h-5 w-5 text-purple-400" />
                        Message Templates
                      </CardTitle>
                      <Button
                        size="sm"
                        className="gap-1 text-xs bg-gradient-to-r from-purple-600 to-pink-600"
                        onClick={() =>
                          toast.info("Template management coming soon")
                        }
                      >
                        <Send className="h-3.5 w-3.5" />
                        Create Template
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {templates.length === 0 ? (
                      <div className="text-center py-12">
                        <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground text-sm">
                          No message templates
                        </p>
                        <p className="text-muted-foreground/60 text-xs mt-1">
                          Create your first template to get started with WhatsApp messaging
                        </p>
                      </div>
                    ) : (
                    <div className="space-y-3">
                      {templates.map((tmpl) => (
                        <div
                          key={tmpl.id}
                          className="rounded-xl border border-border/40 hover:border-border/70 transition-all overflow-hidden"
                        >
                          {/* Template header row */}
                          <button
                            onClick={() =>
                              setExpandedTemplate(
                                expandedTemplate === tmpl.id ? null : tmpl.id
                              )
                            }
                            className="w-full flex items-center gap-4 p-4 text-left bg-muted/20 hover:bg-muted/40 transition-colors"
                          >
                            <div
                              className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                                tmpl.category === "marketing"
                                  ? "bg-purple-500/10 text-purple-400"
                                  : tmpl.category === "utility"
                                    ? "bg-blue-500/10 text-blue-400"
                                    : "bg-green-500/10 text-green-400"
                              )}
                            >
                              <MessageCircle className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="font-semibold text-sm truncate">
                                  {tmpl.name}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0 border shrink-0",
                                    categoryBadge[tmpl.category]
                                  )}
                                >
                                  {tmpl.category}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0 border shrink-0",
                                    tmpl.status === "approved"
                                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  )}
                                >
                                  {tmpl.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {tmpl.body.substring(0, 80)}...
                              </p>
                            </div>
                            <motion.div
                              animate={{ rotate: expandedTemplate === tmpl.id ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronIcon />
                            </motion.div>
                          </button>

                          {/* Expanded preview */}
                          <AnimatePresence>
                            {expandedTemplate === tmpl.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                              >
                                <div className="px-4 pb-4 pt-2 border-t border-border/20 bg-muted/10">
                                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                    {tmpl.body}
                                  </p>
                                  <div className="flex items-center gap-2 mt-3">
                                    <Button size="sm" variant="outline" className="text-xs h-7 border-border/50">
                                      <Send className="h-3 w-3 mr-1" />
                                      Use Template
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground">
                                      Edit
                                    </Button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        {/* ================================================================
            TAB 3 — Automation Rules
        ================================================================ */}
        <TabsContent value="automation" className="mt-4">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="skeleton-automation"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <AutomationSkeleton />
              </motion.div>
            ) : (
              <motion.div
                key="content-automation"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4"
              >
                {/* Auto-Reply */}
                <Card className="bg-muted/30 border-border/50 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ReplyIcon />
                      Auto-Reply
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
                      <div>
                        <p className="text-sm font-medium">Enable Auto-Reply</p>
                        <p className="text-xs text-muted-foreground">
                          Automatically respond to incoming messages
                        </p>
                      </div>
                      <Switch
                        checked={automation.autoReply}
                        onCheckedChange={(v) => {
                          handleUpdateAutomation("autoReply", v);
                          toast.success(
                            `Auto-reply ${v ? "enabled" : "disabled"}`
                          );
                        }}
                      />
                    </div>

                    <AnimatePresence>
                      {automation.autoReply && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Reply Delay</p>
                            <div className="flex flex-wrap gap-2">
                              {AUTO_REPLY_DELAYS.map((d) => (
                                <Button
                                  key={d.value}
                                  size="sm"
                                  variant={
                                    automation.autoReplyDelay === d.value
                                      ? "default"
                                      : "outline"
                                  }
                                  className={cn(
                                    "text-xs h-7",
                                    automation.autoReplyDelay === d.value
                                      ? ""
                                      : "border-border/50 text-muted-foreground hover:text-foreground"
                                  )}
                                  onClick={() =>
                                    handleUpdateAutomation("autoReplyDelay", d.value)
                                  }
                                >
                                  {d.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>

                {/* Away Message */}
                <Card className="bg-muted/30 border-border/50 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-amber-400" />
                      Away Message
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
                      <div>
                        <p className="text-sm font-medium">Enable Away Message</p>
                        <p className="text-xs text-muted-foreground">
                          Send automated responses outside business hours
                        </p>
                      </div>
                      <Switch
                        checked={automation.awayMessageEnabled}
                        onCheckedChange={(v) => {
                          handleUpdateAutomation("awayMessageEnabled", v);
                          toast.success(
                            `Away message ${v ? "enabled" : "disabled"}`
                          );
                        }}
                      />
                    </div>

                    <AnimatePresence>
                      {automation.awayMessageEnabled && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <textarea
                            value={automation.awayMessage}
                            onChange={(e) =>
                              handleUpdateAutomation("awayMessage", e.target.value)
                            }
                            rows={3}
                            className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
                            placeholder="Enter your away message..."
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>

                {/* Business Hours */}
                <Card className="bg-muted/30 border-border/50 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Globe className="h-5 w-5 text-blue-400" />
                      Business Hours
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
                      <div>
                        <p className="text-sm font-medium">Use Business Hours</p>
                        <p className="text-xs text-muted-foreground">
                          Only send messages during working hours
                        </p>
                      </div>
                      <Switch
                        checked={automation.businessHoursEnabled}
                        onCheckedChange={(v) => {
                          handleUpdateAutomation("businessHoursEnabled", v);
                          toast.success(
                            `Business hours ${v ? "enabled" : "disabled"}`
                          );
                        }}
                      />
                    </div>

                    <AnimatePresence>
                      {automation.businessHoursEnabled && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden space-y-4"
                        >
                          {/* Time range */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                Start Time
                              </p>
                              <Input
                                type="time"
                                value={automation.businessStart}
                                onChange={(e) =>
                                  handleUpdateAutomation("businessStart", e.target.value)
                                }
                                className="bg-muted/50 border-border/50"
                              />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                End Time
                              </p>
                              <Input
                                type="time"
                                value={automation.businessEnd}
                                onChange={(e) =>
                                  handleUpdateAutomation("businessEnd", e.target.value)
                                }
                                className="bg-muted/50 border-border/50"
                              />
                            </div>
                          </div>

                          {/* Timezone */}
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              Timezone
                            </p>
                            <select
                              value={automation.timezone}
                              onChange={(e) =>
                                handleUpdateAutomation("timezone", e.target.value)
                              }
                              className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                            >
                              {TIMEZONES.map((tz) => (
                                <option key={tz} value={tz}>
                                  {tz}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Days of week */}
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              Active Days
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {WEEKDAYS.map((day) => (
                                <Button
                                  key={day}
                                  size="sm"
                                  variant={
                                    automation.activeDays.includes(day)
                                      ? "default"
                                      : "outline"
                                  }
                                  className={cn(
                                    "text-xs h-7 w-9 px-0",
                                    automation.activeDays.includes(day)
                                      ? ""
                                      : "border-border/50 text-muted-foreground hover:text-foreground"
                                  )}
                                  onClick={() => handleToggleDay(day)}
                                >
                                  {day}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>

                {/* Lead Matching & Spam Protection */}
                <Card className="bg-muted/30 border-border/50 backdrop-blur-sm">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                          <Users className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Lead Matching</p>
                          <p className="text-xs text-muted-foreground">
                            Match incoming WhatsApp messages to existing leads
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={automation.leadMatching}
                        onCheckedChange={(v) => {
                          handleUpdateAutomation("leadMatching", v);
                          toast.success(
                            `Lead matching ${v ? "enabled" : "disabled"}`
                          );
                        }}
                      />
                    </div>

                    <Separator className="bg-border/30" />

                    <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                          <Shield className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Spam Protection</p>
                          <p className="text-xs text-muted-foreground">
                            Filter and block suspected spam messages
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={automation.spamProtection}
                        onCheckedChange={(v) => {
                          handleUpdateAutomation("spamProtection", v);
                          toast.success(
                            `Spam protection ${v ? "enabled" : "disabled"}`
                          );
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        {/* ================================================================
            TAB 4 — Analytics
        ================================================================ */}
        <TabsContent value="analytics" className="mt-4">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="skeleton-analytics"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <AnalyticsSkeleton />
              </motion.div>
            ) : (
              <motion.div
                key="content-analytics"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4"
              >
                {/* Stat Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Card className="bg-muted/30 border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                            Sent
                          </p>
                          <p className="text-2xl font-bold mt-1">1,284</p>
                        </div>
                        <div className="h-9 w-9 rounded-lg bg-green-500/10 text-green-400 flex items-center justify-center">
                          <Send className="h-4 w-4" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/30 border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                            Received
                          </p>
                          <p className="text-2xl font-bold mt-1">946</p>
                        </div>
                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                          <MessageCircle className="h-4 w-4" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/30 border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                            Response Rate
                          </p>
                          <p className="text-2xl font-bold mt-1">87%</p>
                        </div>
                        <div className="h-9 w-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                          <Zap className="h-4 w-4" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/30 border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                            Avg Response
                          </p>
                          <p className="text-2xl font-bold mt-1">4m</p>
                        </div>
                        <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                          <Clock className="h-4 w-4" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Daily Message Volume Bar Chart */}
                <Card className="bg-muted/30 border-border/50 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Globe className="h-5 w-5 text-cyan-400" />
                      Daily Message Volume
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dailyVolume.length === 0 ? (
                      <div className="text-center py-12">
                        <Globe className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground text-sm">
                          No volume data available
                        </p>
                        <p className="text-muted-foreground/60 text-xs mt-1">
                          Connect your WhatsApp account to see message volume analytics
                        </p>
                      </div>
                    ) : (
                    <>
                    <div className="flex items-end gap-3 h-48 px-2">
                      {dailyVolume.map((d) => (
                        <div
                          key={d.day}
                          className="flex-1 flex flex-col items-center gap-1"
                        >
                          <div className="relative w-full flex gap-0.5 items-end h-36">
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{
                                height: `${(d.sent / maxDaily) * 100}%`,
                              }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                              className="flex-1 rounded-t-md bg-gradient-to-t from-green-600/70 to-green-400/70 min-h-[4px]"
                              title={`Sent: ${d.sent}`}
                            />
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{
                                height: `${(d.received / maxDaily) * 100}%`,
                              }}
                              transition={{
                                duration: 0.6,
                                ease: "easeOut",
                                delay: 0.15,
                              }}
                              className="flex-1 rounded-t-md bg-gradient-to-t from-blue-600/70 to-blue-400/70 min-h-[4px]"
                              title={`Received: ${d.received}`}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {d.day}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Legend */}
                    <div className="flex items-center justify-center gap-6 mt-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-sm bg-green-500/70" />
                        <span className="text-xs text-muted-foreground">
                          Sent
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-sm bg-blue-500/70" />
                        <span className="text-xs text-muted-foreground">
                          Received
                        </span>
                      </div>
                    </div>
                    </>
                    )}
                  </CardContent>
                </Card>

                {/* Activity Timeline */}
                <Card className="bg-muted/30 border-border/50 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="h-5 w-5 text-amber-400" />
                        Activity Timeline
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1 border-border/50"
                        onClick={() => toast.success("Activity refreshed")}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {activityLog.length === 0 ? (
                      <div className="text-center py-12">
                        <Clock className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground text-sm">
                          No recent activity
                        </p>
                        <p className="text-muted-foreground/60 text-xs mt-1">
                          Activity will appear here once messages are sent and received
                        </p>
                      </div>
                    ) : (
                    <div className="space-y-2">
                      {activityLog.map((entry, idx) => (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.08 }}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border/20 hover:border-border/40 transition-colors"
                        >
                          <div className="mt-0.5">{activityIcon[entry.direction]}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-1.5 py-0 border capitalize",
                                  activityColor[entry.direction]
                                )}
                              >
                                {entry.direction}
                              </Badge>
                              <span className="text-xs font-medium truncate">
                                {entry.contact}
                              </span>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                                {entry.time}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {entry.preview}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline sub-components
// ---------------------------------------------------------------------------

function ChevronIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-green-400"
    >
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}
