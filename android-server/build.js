#!/usr/bin/env node
/**
 * Build the Android server (widex-server.jar) without Gradle:
 *   javac (against android.jar)  ->  d8 (dex)  ->  web-desktop/bin/widex-server.jar
 *
 * Requirements: a JDK (Android Studio's bundled JBR works) and the Android SDK (platforms + build-tools).
 * Usage: node android-server/build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const SRC_DIR = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'out');
const CLASSES_DIR = path.join(OUT_DIR, 'classes');
const OUTPUT_JAR = path.join(ROOT, '..', 'web-desktop', 'bin', 'widex-server.jar');
const IS_WINDOWS = process.platform === 'win32';

function exists(p) {
    try {
        fs.accessSync(p);
        return true;
    } catch (e) {
        return false;
    }
}

function findJavaHome() {
    const candidates = [
        process.env.JAVA_HOME,
        IS_WINDOWS ? 'C:\\Program Files\\Android\\Android Studio\\jbr' : null,
        IS_WINDOWS ? 'C:\\Program Files\\Android\\Android Studio\\jre' : null,
        '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
        '/opt/android-studio/jbr',
    ].filter(Boolean);
    for (const home of candidates) {
        if (exists(path.join(home, 'bin', IS_WINDOWS ? 'javac.exe' : 'javac'))) {
            return home;
        }
    }
    throw new Error('JDK not found: set JAVA_HOME (Android Studio includes one in its "jbr" folder)');
}

function findSdk() {
    const candidates = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        IS_WINDOWS && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
        process.env.HOME ? path.join(process.env.HOME, 'Android', 'Sdk') : null,
        process.env.HOME ? path.join(process.env.HOME, 'Library', 'Android', 'sdk') : null,
    ].filter(Boolean);
    for (const sdk of candidates) {
        if (exists(path.join(sdk, 'platforms'))) {
            return sdk;
        }
    }
    throw new Error('Android SDK not found: set ANDROID_HOME');
}

function compareVersions(a, b) {
    const pa = a.replace(/^android-/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
    const pb = b.replace(/^android-/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); ++i) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) {
            return d;
        }
    }
    return 0;
}

function latest(dir, predicate) {
    const entries = fs.readdirSync(dir).filter((name) => predicate(path.join(dir, name)));
    if (!entries.length) {
        throw new Error('Nothing usable found in ' + dir);
    }
    entries.sort(compareVersions);
    return path.join(dir, entries[entries.length - 1]);
}

function listJavaFiles(dir) {
    const result = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...listJavaFiles(p));
        } else if (entry.name.endsWith('.java')) {
            result.push(p);
        }
    }
    return result;
}

function listClassFiles(dir) {
    const result = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...listClassFiles(p));
        } else if (entry.name.endsWith('.class')) {
            result.push(p);
        }
    }
    return result;
}

function main() {
    const javaHome = findJavaHome();
    const sdk = findSdk();
    const platform = latest(path.join(sdk, 'platforms'), (p) => exists(path.join(p, 'android.jar')));
    const androidJar = path.join(platform, 'android.jar');
    const buildTools = latest(path.join(sdk, 'build-tools'), (p) => exists(path.join(p, 'lib', 'd8.jar')));
    const d8Jar = path.join(buildTools, 'lib', 'd8.jar');
    const javac = path.join(javaHome, 'bin', IS_WINDOWS ? 'javac.exe' : 'javac');
    const java = path.join(javaHome, 'bin', IS_WINDOWS ? 'java.exe' : 'java');

    console.log('JDK:         ' + javaHome);
    console.log('android.jar: ' + androidJar);
    console.log('d8:          ' + d8Jar);

    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(CLASSES_DIR, { recursive: true });

    const sources = listJavaFiles(SRC_DIR);
    const argsFile = path.join(OUT_DIR, 'sources.txt');
    fs.writeFileSync(argsFile, sources.map((s) => '"' + s.replace(/\\/g, '/') + '"').join('\n'));

    console.log('Compiling ' + sources.length + ' Java files...');
    execFileSync(javac, [
        '-source', '8', '-target', '8',
        '-bootclasspath', androidJar,
        '-encoding', 'UTF-8',
        '-Xlint:-options',
        '-Xlint:deprecation',
        '-d', CLASSES_DIR,
        '@' + argsFile,
    ], { stdio: 'inherit' });

    console.log('Dexing...');
    const classes = listClassFiles(CLASSES_DIR);
    const dexArgsFile = path.join(OUT_DIR, 'classes.txt');
    fs.writeFileSync(dexArgsFile, classes.join('\n'));
    const tmpJar = path.join(OUT_DIR, 'widex-server.jar');
    execFileSync(java, [
        '-cp', d8Jar, 'com.android.tools.r8.D8',
        '--release',
        '--min-api', '26',
        '--lib', androidJar,
        '--output', tmpJar,
        '@' + dexArgsFile,
    ], { stdio: 'inherit' });

    fs.mkdirSync(path.dirname(OUTPUT_JAR), { recursive: true });
    fs.copyFileSync(tmpJar, OUTPUT_JAR);
    console.log('OK: ' + OUTPUT_JAR + ' (' + fs.statSync(OUTPUT_JAR).size + ' bytes)');
}

try {
    main();
} catch (e) {
    console.error('Build failed: ' + e.message);
    process.exit(1);
}
