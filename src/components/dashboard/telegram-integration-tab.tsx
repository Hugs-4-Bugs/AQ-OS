"use client";

import React, { useState, useCallback } from "react";
import {
  Send,
  Bot,
  Bell,
  BellOff,
  MessageSquare,
  Users,
  Settings,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  ExternalLink,
  Shield,
  Clock,
  TrendingUp,
  AlertTriangle,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Globe,
  Hash,
  AtSign,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface TelegramChannel {
  id: string;
  name: string;
  type: "private" | "group" | "channel";
  chatId: string;
  isActive: boolean;
  lastActivity?: string;
  messageCount?: number;
}

interface TelegramMessage {
  id: string;
  type: "lead_reply" | "deal_update" | "reminder" | "system" | "daily_summary";
  channel: string;
  content: string;
  status: "sent" | "delivered" | "failed" | "pending";
  timestamp: string;
}

// Channels and messages are initialized as empty arrays in state below

const NOTIFICATION_TYPES = [
  {
    id: "lead_reply",
    label: "Lead Replies",
    description: "Get notified when leads reply to your outreach",
    icon: MessageSquare,
    color: "text-green-400",
  },
  {
    id: "deal_update",
    label: "Deal Updates",
    description: "Pipeline stage changes and deal milestones",
    icon: TrendingUp,
    color: "text-blue-400",
  },
  {
    id: "reminder",
    label: "Follow-up Reminders",
    description: "Scheduled follow-up alerts for leads",
    icon: Clock,
    color: "text-amber-400",
  },
  {
    id: "system",
    label: "System Alerts",
    description: "Credits low, subscription changes, security alerts",
    icon: AlertTriangle,
    color: "text-red-400",
  },
  {
    id: "daily_summary",
    label: "Daily Summary",
    description: "End-of-day activity digest",
    icon: Zap,
    color: "text-purple-400",
  },
];

export default function TelegramIntegrationTab() {
  const [botToken, setBotToken] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [activeTab, setActiveTab] = useState("connection");
  const [notifications, setNotifications] = useState<Record<string, boolean>>({
    lead_reply: true,
    deal_update: true,
    reminder: true,
    system: true,
    daily_summary: false,
  });
  const [showToken, setShowToken] = useState(false);
  const [digestTime, setDigestTime] = useState("09:00");
  const [digestFrequency, setDigestFrequency] = useState("daily");

  const handleConnect = useCallback(async () => {
    if (!botToken.trim()) {
      toast.error("Please enter a bot token");
      return;
    }
    setIsConnecting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsConnected(true);
    setIsConnecting(false);
    toast.success("Telegram bot connected successfully!");
  }, [botToken]);

  const handleDisconnect = useCallback(async () => {
    setIsConnecting(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsConnected(false);
    setBotToken("");
    setIsConnecting(false);
    toast.success("Telegram bot disconnected");
  }, []);

  const handleToggleChannel = useCallback((channelId: string) => {
    setChannels((prev) =>
      prev.map((ch) =>
        ch.id === channelId ? { ...ch, isActive: !ch.isActive } : ch
      )
    );
    const channel = channels.find((c) => c.id === channelId);
    if (channel) {
      toast.success(
        `${channel.name} ${channel.isActive ? "disabled" : "enabled"}`
      );
    }
  }, [channels]);

  const handleRemoveChannel = useCallback((channelId: string) => {
    const channel = channels.find((c) => c.id === channelId);
    setChannels((prev) => prev.filter((ch) => ch.id !== channelId));
    if (channel) toast.success(`Removed ${channel.name}`);
  }, [channels]);

  const handleToggleNotification = useCallback((typeId: string) => {
    setNotifications((prev) => {
      const updated = { ...prev, [typeId]: !prev[typeId] };
      toast.success(
        `${typeId.replace(/_/g, " ")} ${updated[typeId] ? "enabled" : "disabled"}`
      );
      return updated;
    });
  }, []);

  const handleCopyToken = useCallback(() => {
    navigator.clipboard.writeText(botToken);
    toast.success("Bot token copied to clipboard");
  }, [botToken]);

  const handleResendMessage = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, status: "sent" as const } : m
      )
    );
    toast.success("Message resent");
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case "sent":
        return <CheckCircle2 className="h-4 w-4 text-blue-400" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-400" />;
      case "pending":
        return <RefreshCw className="h-4 w-4 text-amber-400 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (type: string) => {
    const colors: Record<string, string> = {
      lead_reply: "bg-green-500/10 text-green-400 border-green-500/20",
      deal_update: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      reminder: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      system: "bg-red-500/10 text-red-400 border-red-500/20",
      daily_summary: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    };
    return colors[type] || "bg-muted text-muted-foreground border-border";
  };

  const activeChannels = channels.filter((c) => c.isActive).length;
  const totalMessages = messages.length;
  const deliveredCount = messages.filter(
    (m) => m.status === "delivered" || m.status === "sent"
  ).length;

  return (
    <div className="space-y-6 p-1">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="bg-muted/30 border-border/50 stat-card-v2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Bot Status
                </p>
                <p className="text-2xl font-bold mt-1">
                  {isConnected ? "Active" : "Inactive"}
                </p>
              </div>
              <div
                className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                  isConnected
                    ? "bg-green-500/10 text-green-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Bot className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-border/50 stat-card-v2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Active Channels
                </p>
                <p className="text-2xl font-bold mt-1">{activeChannels}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-border/50 stat-card-v2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Messages Sent
                </p>
                <p className="text-2xl font-bold mt-1">{totalMessages}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Send className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-border/50 stat-card-v2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Delivery Rate
                </p>
                <p className="text-2xl font-bold mt-1">
                  {totalMessages > 0
                    ? Math.round((deliveredCount / totalMessages) * 100)
                    : 0}
                  %
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 border border-border/50 p-1">
          <TabsTrigger value="connection" className="gap-2 text-xs">
            <Settings className="h-3.5 w-3.5" />
            Connection
          </TabsTrigger>
          <TabsTrigger value="channels" className="gap-2 text-xs">
            <Users className="h-3.5 w-3.5" />
            Channels
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2 text-xs">
            <Bell className="h-3.5 w-3.5" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2 text-xs">
            <MessageSquare className="h-3.5 w-3.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Connection Tab */}
        <TabsContent value="connection" className="mt-4">
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-400" />
                Bot Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Connection Status */}
              <div
                className={`flex items-center gap-4 p-4 rounded-xl border ${
                  isConnected
                    ? "bg-green-500/5 border-green-500/20"
                    : "bg-muted/50 border-border/50"
                }`}
              >
                <div
                  className={`connection-status-dot ${
                    isConnected ? "bg-green-400" : "bg-muted-foreground"
                  }`}
                />
                <div className="flex-1">
                  <p className="font-semibold">
                    {isConnected ? "Bot Connected" : "Bot Disconnected"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isConnected
                      ? "Your Telegram bot is active and receiving notifications"
                      : "Connect your bot token to start sending notifications"}
                  </p>
                </div>
                {isConnected ? (
                  <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </div>

              {/* Bot Token Input */}
              {!isConnected ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bot-token" className="text-sm font-medium">
                      Bot Token
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Get your bot token from{" "}
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                      >
                        @BotFather
                      </a>{" "}
                      on Telegram
                    </p>
                    <div className="relative">
                      <Input
                        id="bot-token"
                        type={showToken ? "text" : "password"}
                        placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                        value={botToken}
                        onChange={(e) => setBotToken(e.target.value)}
                        className="pr-20 font-mono text-sm"
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowToken(!showToken)}
                          className="h-7 px-2 text-xs"
                        >
                          {showToken ? "Hide" : "Show"}
                        </Button>
                        {botToken && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyToken}
                            className="h-7 px-2 text-xs"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleConnect}
                    disabled={!botToken.trim() || isConnecting}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white"
                  >
                    {isConnecting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Connect Bot
                      </>
                    )}
                  </Button>

                  {/* Setup Guide */}
                  <div className="bg-muted/50 rounded-xl p-4 border border-border/30">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-400" />
                      Quick Setup Guide
                    </h4>
                    <ol className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 text-xs flex items-center justify-center font-bold">
                          1
                        </span>
                        <span>
                          Message{" "}
                          <span className="text-blue-400 font-medium">
                            @BotFather
                          </span>{" "}
                          on Telegram and send{" "}
                          <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
                            /newbot
                          </code>
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 text-xs flex items-center justify-center font-bold">
                          2
                        </span>
                        <span>
                          Follow the prompts to set your bot name and username
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 text-xs flex items-center justify-center font-bold">
                          3
                        </span>
                        <span>Copy the API token and paste it above</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 text-xs flex items-center justify-center font-bold">
                          4
                        </span>
                        <span>
                          Add your bot to groups/channels and configure
                          notifications below
                        </span>
                      </li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Button
                    onClick={handleDisconnect}
                    disabled={isConnecting}
                    variant="outline"
                    className="w-full border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    {isConnecting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Disconnecting...
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Disconnect Bot
                      </>
                    )}
                  </Button>

                  {/* Webhook Info */}
                  <div className="bg-muted/50 rounded-xl p-4 border border-border/30">
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Globe className="h-4 w-4 text-green-400" />
                      Webhook Configuration
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Webhook URL
                        </span>
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono max-w-[200px] truncate">
                          /api/integrations/telegram/webhook
                        </code>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Status</span>
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                          Configured
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Last Ping
                        </span>
                        <span className="text-xs">30 seconds ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Channels Tab */}
        <TabsContent value="channels" className="mt-4">
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-400" />
                  Chat Channels
                </CardTitle>
                <Button
                  size="sm"
                  className="gap-1 text-xs bg-gradient-to-r from-purple-600 to-pink-600"
                  onClick={() =>
                    toast.info(
                      "Add your Telegram bot to a group/channel, then it will appear here"
                    )
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Channel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {channels.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground text-sm">
                    No channels configured yet
                  </p>
                  <p className="text-muted-foreground/60 text-xs mt-1">
                    Add your bot to a Telegram group or channel
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {channels.map((channel) => (
                    <div
                      key={channel.id}
                      className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 ${
                        channel.isActive
                          ? "bg-muted/30 border-border/50 hover:border-primary/20"
                          : "bg-muted/10 border-border/20 opacity-60"
                      }`}
                    >
                      <div
                        className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                          channel.type === "private"
                            ? "bg-blue-500/10 text-blue-400"
                            : channel.type === "group"
                            ? "bg-purple-500/10 text-purple-400"
                            : "bg-cyan-500/10 text-cyan-400"
                        }`}
                      >
                        {channel.type === "private" ? (
                          <Bot className="h-5 w-5" />
                        ) : channel.type === "group" ? (
                          <Users className="h-5 w-5" />
                        ) : (
                          <Globe className="h-5 w-5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate">
                            {channel.name}
                          </p>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {channel.type}
                          </Badge>
                          {channel.isActive && (
                            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            {channel.chatId}
                          </span>
                          {channel.lastActivity && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {channel.lastActivity}
                            </span>
                          )}
                          {channel.messageCount && (
                            <span className="flex items-center gap-1">
                              <AtSign className="h-3 w-3" />
                              {channel.messageCount} messages
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleChannel(channel.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title={
                            channel.isActive ? "Disable" : "Enable"
                          }
                        >
                          {channel.isActive ? (
                            <ToggleRight className="h-8 w-8 text-green-400" />
                          ) : (
                            <ToggleLeft className="h-8 w-8" />
                          )}
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveChannel(channel.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-4">
          <div className="space-y-4">
            <Card className="bg-muted/30 border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5 text-amber-400" />
                  Notification Types
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {NOTIFICATION_TYPES.map((notif) => (
                  <div
                    key={notif.id}
                    className="flex items-center justify-between p-4 rounded-xl border border-border/30 hover:border-border/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center ${notif.color}`}
                      >
                        <notif.icon className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{notif.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {notif.description}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={notifications[notif.id] || false}
                      onCheckedChange={() => handleToggleNotification(notif.id)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-muted/30 border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-purple-400" />
                  Digest Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Digest Frequency</Label>
                    <Select value={digestFrequency} onValueChange={setDigestFrequency}>
                      <SelectTrigger className="bg-muted/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Send At</Label>
                    <Input
                      type="time"
                      value={digestTime}
                      onChange={(e) => setDigestTime(e.target.value)}
                      className="bg-muted/50"
                    />
                  </div>
                </div>
                <Separator className="bg-border/30" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Quiet Hours</p>
                    <p className="text-xs text-muted-foreground">
                      Pause notifications during off-hours
                    </p>
                  </div>
                  <Switch
                    checked={false}
                    onCheckedChange={(checked) =>
                      toast.success(
                        `Quiet hours ${checked ? "enabled" : "disabled"}`
                      )
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-4">
          <Card className="bg-muted/30 border-border/50">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-cyan-400" />
                  Recent Messages
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => toast.success("Activity log refreshed")}
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground text-sm">
                    No recent messages
                  </p>
                  <p className="text-muted-foreground/60 text-xs mt-1">
                    Messages will appear here once your bot is connected and active
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                {messages.map((msg, idx) => (
                  <div
                    key={msg.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/20 hover:border-border/40 transition-colors"
                    style={{
                      animationDelay: `${idx * 50}ms`,
                    }}
                  >
                    <div className="mt-0.5">{getStatusIcon(msg.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${getStatusBadge(msg.type)}`}
                        >
                          {msg.type.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {msg.channel}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90">{msg.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {msg.timestamp}
                      </p>
                    </div>
                    {msg.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResendMessage(msg.id)}
                        className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
