"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { client } from "@/lib/api";

export interface User {
  id: number;
  username: string;
  email_verified: boolean;
  phone_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  loadingUser: boolean;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
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
      const response = await client?.auth.verify.$get();
      if (!response || response.status !== 200) {
        setUser(null);
        return;
      }

      const data = await response.json();
      if (data && data.user) {
        setUser({
          id: data.user.id ?? 0,
          username: data.user.username ?? "",
          email_verified: data.user.email_verified,
          phone_verified: data.user.phone_verified,
        });
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Error fetching session:", error);
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  }

  // Logout function: call logout endpoint and clear auth state
  async function logout() {
    const response = await client.logout.$post();

    if (response?.status === 200) {
      setUser(null);

      await fetch("/api/logout", {
        method: "GET",
        credentials: "include",
      });

      // Redirect to home after logout
      window.location.href = "/";
    }
  }

  // On mount, load the session.
  useEffect(() => {
    if (access_token) {
      // console.log("fetchSession");
      // fetchSession();
    }
  }, [access_token]);

  return (
    <AuthContext.Provider value={{ user, loadingUser, setUser, logout }}>
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
