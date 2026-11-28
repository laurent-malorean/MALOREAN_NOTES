#!/usr/bin/env python3
"""Mesure le démarrage de la saisie vocale (fiche 0107).

Usage : mesure.py <assistant malorean-voice> [langue ou « - » pour la langue du Mac] [répétitions]
        [--resume]

Avec `--resume`, n'écrit que la médiane, le minimum et le maximum de chaque étape sur toutes les
répétitions.

Pour chaque répétition : lance `status`, puis `listen <langue>` avec `MALOREAN_VOICE_TRACE=1`,
note l'instant (depuis le lancement) où chaque événement sort sur la sortie standard et recopie
les étapes que l'assistant écrit sur la sortie d'erreur ; arrête l'écoute quand `listening` est
arrivé depuis deux secondes. Les temps sont des mesures, en millisecondes.
"""
import json
import os
import subprocess
import sys
import threading
import time


def status(helper):
    start = time.monotonic()
    subprocess.run([helper, "status"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return (time.monotonic() - start) * 1000


def listen(helper, language, seconds_after_listening=2.0):
    env = dict(os.environ, MALOREAN_VOICE_TRACE="1")
    start = time.monotonic()
    process = subprocess.Popen(
        [helper, "listen"] + ([] if language == "-" else [language]),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True,
    )
    lines = []

    def read(stream, kind):
        for line in stream:
            lines.append(((time.monotonic() - start) * 1000, kind, line.rstrip()))

    for stream, kind in ((process.stdout, "out"), (process.stderr, "err")):
        threading.Thread(target=read, args=(stream, kind), daemon=True).start()
    stop_at = None
    deadline = start + 40
    while process.poll() is None and time.monotonic() < deadline:
        heard = [line for line in lines if line[1] == "out" and '"listening"' in line[2]]
        if heard and stop_at is None:
            stop_at = time.monotonic() + seconds_after_listening
        if stop_at and time.monotonic() >= stop_at:
            process.stdin.write("stop\n")
            process.stdin.flush()
            stop_at = deadline
        time.sleep(0.02)
    process.wait(timeout=10)
    return lines


def summary(helper, language, repeats):
    stages = {}
    for _ in range(repeats):
        stages.setdefault("status (programme entier, avant l'écoute)", []).append(status(helper))
        for at, kind, line in listen(helper, language):
            if kind == "out" and '"listening"' in line:
                stages.setdefault("événement listening (depuis le lancement de listen)", []).append(at)
            if kind == "err" and "[trace]" in line:
                label = line.split("ms", 1)[1].strip()
                if label.startswith("analyseur ouvert"):
                    label = "analyseur ouvert"
                stages.setdefault(label, []).append(float(line.split("]")[1].split("ms")[0]))
    for label, values in stages.items():
        values.sort()
        print(
            f"{label} : médiane {values[len(values) // 2]:.0f} ms, "
            f"min {values[0]:.0f}, max {values[-1]:.0f} ({len(values)} mesures)"
        )


def main():
    helper = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "fr-FR"
    repeats = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 3
    if "--resume" in sys.argv:
        return summary(helper, language, repeats)
    for index in range(repeats):
        print(f"--- essai {index + 1}")
        print(f"status : {status(helper):.0f} ms (programme entier)")
        for at, kind, line in listen(helper, language):
            if kind == "out" and '"level"' in line:
                continue
            label = "sortie" if kind == "out" else "trace "
            print(f"{at:7.0f} ms  {label}  {json.dumps(line, ensure_ascii=False)[1:-1]}")


if __name__ == "__main__":
    main()
