#!/bin/sh
# iPhoneアプリ（IPA）の材料 kaku-ios.zip を作る。リポジトリの一番上で動かす。
# ios/（Xcode の設定・Swift）＋ いまのウェブの中身（Resources/web）をまとめる。
# kaku-ios.zip を push すると GitHub Actions（build-ipa.yml）が IPA を作って release「ipa-latest」に出す。
# 出す前に ios/project.yml の CURRENT_PROJECT_VERSION を1つ上げること。
set -e
T=$(mktemp -d)
cp -r ios/project.yml ios/Sources "$T/"
mkdir -p "$T/Resources/web"
cp -r ios/Resources/Assets.xcassets "$T/Resources/"
cp -r index.html manifest.json icon-192.png icon-512.png css js vendor old "$T/Resources/web/"
rm -f kaku-ios.zip
(cd "$T" && zip -qr - .) > kaku-ios.zip
rm -rf "$T"
echo "kaku-ios.zip を作りました（$(du -h kaku-ios.zip | cut -f1)）"
