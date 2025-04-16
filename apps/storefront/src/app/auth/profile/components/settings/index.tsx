"use client";

import { z } from "zod";
import { useTheme } from "next-themes";
import { useForm } from "@tanstack/react-form";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";

import { Switch } from "@workspace/ui/components/switch";
import { Separator } from "@workspace/ui/components/separator";

import { Label } from "@workspace/ui/components/label";
import { toast } from "sonner";
import { Bell, Moon, Sun } from "lucide-react";

const notificationsFormSchema = z.object({
  marketingEmails: z.boolean().default(false),
  socialNotifications: z.boolean().default(true),
  newFeatures: z.boolean().default(true),
  securityNotifications: z.boolean().default(true),
});

type NotificationsFormValues = z.infer<typeof notificationsFormSchema>;

const defaultValues: Partial<NotificationsFormValues> = {
  marketingEmails: false,
  socialNotifications: true,
  newFeatures: true,
  securityNotifications: true,
};

export default function UserSettingsPage() {
  const { theme, setTheme } = useTheme();

  const form = useForm({
    defaultValues,
    validators: {
      onChange: notificationsFormSchema,
    },
  });

  /*
  function onNotificationsSubmit(data: NotificationsFormValues) {
    toast("Notification preferences updated", {
      description:
        "Your notification preferences have been updated successfully.",
    });
    console.log(data);
  }
    */

  return (
    <div className="container mx-auto px-4">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
        <Separator />
        <Tabs defaultValue="notifications" className="space-y-6">
          <TabsList>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                  Configure how you receive notifications.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    form.handleSubmit();
                  }}
                  className="space-y-8"
                >
                  <div className="space-y-4">
                    <form.Field name="socialNotifications">
                      {(field) => {
                        return (
                          <div className="space-y-0.5">
                            <Label className="text-base">
                              Social notifications
                            </Label>
                            <p>
                              Receive notifications when someone mentions you or
                              replies to your messages.
                            </p>

                            <Switch
                              checked={field.state.value}
                              onCheckedChange={field.handleChange}
                            />
                          </div>
                        );
                      }}
                    </form.Field>

                    <form.Field name="newFeatures">
                      {(field) => {
                        return (
                          <div className="space-y-0.5">
                            <div className="space-y-0.5">
                              <Label className="text-base">New features</Label>
                              <p>
                                Receive notifications about new features and
                                updates.
                              </p>
                            </div>
                            <Switch
                              checked={field.state.value}
                              onCheckedChange={field.handleChange}
                            />
                          </div>
                        );
                      }}
                    </form.Field>

                    <form.Field name="securityNotifications">
                      {(field) => {
                        return (
                          <div className="space-y-0.5">
                            <Label className="text-base">
                              Security notifications
                            </Label>
                            <p>
                              Receive notifications about your account security.
                            </p>
                            <Switch
                              checked={field.state.value}
                              onCheckedChange={field.handleChange}
                            />{" "}
                          </div>
                        );
                      }}
                    </form.Field>
                  </div>
                  <Button type="submit">
                    <Bell className="mr-2 h-4 w-4" />
                    Update notifications
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>
                  Customize the appearance of the app. Automatically switch
                  between day and night themes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant={theme === "light" ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="mr-2 h-4 w-4" />
                      Light
                    </Button>
                    <Button
                      variant={theme === "dark" ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="mr-2 h-4 w-4" />
                      Dark
                    </Button>
                    <Button
                      variant={theme === "system" ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => setTheme("system")}
                    >
                      <span className="mr-2">🖥️</span>
                      System
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Select the theme for the dashboard.
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <p className="text-sm text-muted-foreground">
                  Your theme preference will be saved to your account.
                </p>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
