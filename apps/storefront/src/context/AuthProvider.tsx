"use client";

import "dotenv/config";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { client } from "@/lib/api";
import { verify } from "hono/jwt";
import { access } from "fs";

export interface User {
  id: number;
  username: string;
  exp: number;
}

interface AuthContextType {
  user: User | null;
  loadingUser: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({
  children,
  access_token,
}: {
  children: ReactNode;
  access_token?: string;
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  async function fetchSession() {
    try {
      const response = await client?.auth.me.$get({
        credentials: "include",
      });

      if (response?.status !== 200) setUser(null);

      const data = await response?.json();

      if (data && "user" in data) {
        setUser({
          id: data?.user?.id ?? 0,
          username: data?.user.username ?? "",
          exp: data?.user?.exp ?? 0,
        });
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Error fetching session:", error);
      setUser(null);
    } finally {
      setLoadingUser(false); // Ensure loading is set to false after fetching
    }
  }

  // On mount, load the session.
  useEffect(() => {
    if (access_token) {
      fetchSession();
    }
  }, [access_token]);

  // Set up a timer to refresh the token in the background.
  useEffect(() => {
    // If there’s no user or no expiration info, do nothing.
    if (!user || !user?.exp) return;

    const now = Date.now() / 1000; // convert current time to seconds
    const timeUntilExpiry = user.exp - now;
    // Define a threshold (e.g., 60 seconds before expiry)
    const refreshThreshold = 60;

    // If token is already expired or about to expire, refresh immediately.
    if (timeUntilExpiry <= refreshThreshold) {
      refreshSession();
      return;
    }

    // Otherwise, set a timeout to refresh a little before expiration.
    const timeout = setTimeout(
      () => {
        refreshSession();
      },
      (timeUntilExpiry - refreshThreshold) * 1000,
    );

    return () => clearTimeout(timeout);
  }, [user]);

  // Login function: call login endpoint and update auth state
  async function login(email: string, password: string) {
    const res = await client?.login.$post({
      json: {
        email,
        password,
      },
    });

    if (res.status === 200) {
      const data = await res.json();
      setUser(data.user);
    } else {
      throw new Error("Login failed");
    }
  }

  // Logout function: call logout endpoint and clear auth state
  async function logout() {
    const res = await client?.logout.$post();

    if (res?.status === 200) {
      setUser(null);
    }
  }

  // Refresh token silently in the background.
  async function refreshSession() {
    try {
      const refreshRes = await client?.auth.refresh.$post();

      if (refreshRes?.status === 200) {
        const data = await refreshRes.json();
        // Optionally decode the new access token to update the expiry.
        const decoded = await verify(
          data.access_token,
          process.env.ACCESS_TOKEN_SECRET!,
        );
        // If you have a user in state, update its expiry.
        if (user && decoded.exp) {
          setUser({ ...user, exp: decoded.exp });
        }
      } else {
        // If refresh fails, clear session (or handle as needed).
        setUser(null);
      }
    } catch (error) {
      console.error("Error refreshing token:", error);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, loadingUser, setUser, login, logout, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
