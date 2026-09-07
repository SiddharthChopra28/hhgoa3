"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TriangleAlert, X } from "lucide-react";
import { CheckRecord } from "@/components/check-record";
import { Dropzone } from "@/components/dropzone";
import { HealthPill } from "@/components/health-pill";
import { PhotoPanel } from "@/components/photo-panel";
import { SiteFooter } from "@/components/site-footer";
import { NoFaceState, StageList } from "@/components/stage-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePipeline } from "@/hooks/use-pipeline";

export default function Page() {
  return (
    <>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-10 pb-4 sm:pt-14">
        <Header />
        <Tabs defaultValue="trace" className="mt-10">
          <TabsList>
            <TabsTrigger value="trace">Trace a photo</TabsTrigger>
            <TabsTrigger value="check">Check a record</TabsTrigger>
          </TabsList>
          <TabsContent value="trace">
            <TraceTab />
          </TabsContent>
          <TabsContent value="check">
            <CheckRecord />
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </>
  );
}

function Header() {
  return (
    <header className="space-y-5">
      <HealthPill />
      <div className="space-y-4">
        <h1 className="max-w-2xl text-[34px] leading-[1.1] font-medium tracking-[-0.02em] text-ink-100 sm:text-[44px]">
          Where has this photo been posted?
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-400">
          Upload a photo. It is reverse-image-searched against public posts, and the
          face in the photo is used only to verify that the results really contain it
          — never to search by face. The best verified match is sealed on Arbitrum as
          a tamper-evident record.
        </p>
      </div>
    </header>
  );
}

function TraceTab() {
  const reduced = useReducedMotion();
  const { state, sealing, run, reset, retrySeal } = usePipeline();
  const [file, setFile] = React.useState<File | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  const startOver = React.useCallback(() => {
    reset();
    setFile(null);
    setDismissed(false);
  }, [reset]);

  const running = state.status === "running";
  const hasRun = state.status !== "idle";
  const noFace =
    state.result?.outcome === "no_face" ||
    state.stages.find((s) => s.stage === "detect")?.status === "error";

  if (!file) {
    return (
      <div className="mx-auto max-w-2xl">
        <Dropzone
          onFile={(f) => {
            setFile(f);
            reset();
          }}
          hint="Image-level provenance, not identity search."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {state.transportError && !dismissed ? (
          <motion.div
            key="banner"
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <p className="flex-1 text-[13px] leading-relaxed text-danger">
              {state.transportError}
            </p>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="rounded-md p-1 text-danger/70 transition-colors duration-150 hover:text-danger"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-10 lg:self-start">
          <PhotoPanel
            file={file}
            box={state.detect?.box ?? state.result?.box}
            sourceWidth={state.upload?.width}
            sourceHeight={state.upload?.height}
            running={running}
            hasRun={hasRun}
            onRun={() => void run(file)}
            onReset={startOver}
          />
        </div>

        <div className="min-w-0">
          {!hasRun ? (
            <div className="rounded-lg border border-hairline bg-ink-950/70 px-6 py-10 text-center">
              <p className="text-sm text-ink-300">Ready when you are.</p>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-600">
                Press Run to normalise the photo, encode the face, search public posts
                and seal the best verified match.
              </p>
            </div>
          ) : noFace ? (
            <NoFaceState onReset={startOver} />
          ) : (
            <StageList
              state={state}
              file={file}
              sealing={sealing}
              onRetrySeal={() => void retrySeal()}
            />
          )}

          {state.status === "done" ? (
            <div className="mt-8">
              <Button size="sm" variant="ghost" onClick={startOver}>
                Start over
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
