import React, { useState } from 'react';
import ChartDBLogo from '@/assets/logo-light.png';
import ChartDBDarkLogo from '@/assets/logo-dark.png';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { Label } from '@/components/label/label';
import { Spinner } from '@/components/spinner/spinner';
import { useTheme } from '@/hooks/use-theme';

export const SyncAuthScreen: React.FC<{
    authenticating: boolean;
    error: string | null;
    onLogin: (password: string) => Promise<void>;
}> = ({ authenticating, error, onLogin }) => {
    const [password, setPassword] = useState('');
    const { effectiveTheme } = useTheme();

    return (
        <main className="flex h-dvh w-dvw items-center justify-center bg-background p-4">
            <form
                className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6 shadow-lg"
                onSubmit={(event) => {
                    event.preventDefault();
                    void onLogin(password);
                }}
            >
                <img
                    src={
                        effectiveTheme === 'light'
                            ? ChartDBLogo
                            : ChartDBDarkLogo
                    }
                    alt="ChartDB"
                    className="mx-auto h-5"
                />
                <div className="space-y-1 text-center">
                    <h1 className="text-lg font-semibold">Shared workspace</h1>
                    <p className="text-sm text-muted-foreground">
                        Enter the deployment password to load synchronized
                        diagrams.
                    </p>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="sync-password">Password</Label>
                    <Input
                        id="sync-password"
                        type="password"
                        autoComplete="current-password"
                        autoFocus
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={authenticating}
                    />
                </div>
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                <Button
                    type="submit"
                    className="w-full"
                    disabled={authenticating || password.length === 0}
                >
                    {authenticating ? <Spinner className="size-4" /> : null}
                    Unlock workspace
                </Button>
            </form>
        </main>
    );
};
