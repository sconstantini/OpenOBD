#!/bin/sh
# Gera o APK a partir de android/ e app/, só com o JDK e o Android SDK. Não baixa nada.
# Uso: sh ferramentas/construir_apk.sh [--teste]   (--teste permite inspecionar a página pelo PC)
# Precisa de: JDK 11 ou mais novo no PATH ou em JAVA_HOME, e ANDROID_HOME com build-tools e uma plataforma.
set -eu

RAIZ=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SDK=${ANDROID_HOME:-$HOME/Android/Sdk}
FERR=$(ls -d "$SDK"/build-tools/* | sort -V | tail -n 1)
PLAT=$(ls -d "$SDK"/platforms/android-* | sort -V | tail -n 1)/android.jar
[ -f "$PLAT" ] || PLAT=$(ls "$SDK"/platforms/android-*/android.jar | sort -V | tail -n 1)
[ -n "${JAVA_HOME:-}" ] && PATH="$JAVA_HOME/bin:$PATH" && export PATH
OBRA="$RAIZ/build"
CHAVES="$RAIZ/meus_dados"
MODO=""
[ "${1:-}" = "--teste" ] && MODO="--debug-mode"

rm -rf "$OBRA"
mkdir -p "$OBRA/assets" "$OBRA/classes" "$OBRA/dex" "$CHAVES"
cp -R "$RAIZ/app" "$OBRA/assets/www"

# Nada pessoal entra no APK.
if find "$OBRA/assets" \( -name '*.glb' -o -name '*.gltf' -o -name '*.csv' -o -name '*.local.json' -o -name 'meus_dados' \) | grep -q .; then
  echo "ERRO  dados pessoais dentro de app/" >&2
  exit 1
fi

"$FERR/aapt2" compile --dir "$RAIZ/android/res" -o "$OBRA/res.zip"
"$FERR/aapt2" link -I "$PLAT" --manifest "$RAIZ/android/AndroidManifest.xml" --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 1 --version-name 0.1 $MODO -A "$OBRA/assets" -o "$OBRA/base.apk" "$OBRA/res.zip"
find "$RAIZ/android/src" -name '*.java' -print0 | xargs -0 javac -nowarn --release 11 -classpath "$PLAT" -d "$OBRA/classes"
find "$OBRA/classes" -name '*.class' -print0 | xargs -0 "$FERR/d8" --release --min-api 24 --lib "$PLAT" --output "$OBRA/dex"
(cd "$OBRA/dex" && zip -q "$OBRA/base.apk" classes.dex)
"$FERR/zipalign" -f 4 "$OBRA/base.apk" "$OBRA/alinhado.apk"

# A chave fica fora do Git. Sem a mesma chave, o Android só atualiza o app apagando os dados dele.
CHAVE="$CHAVES/assinatura.keystore"
SENHA="$CHAVES/assinatura.senha"
if [ ! -f "$CHAVE" ]; then
  od -An -N24 -tx1 /dev/urandom | tr -d ' \n' > "$SENHA"
  keytool -genkeypair -keystore "$CHAVE" -storepass:file "$SENHA" -keypass:file "$SENHA" -alias obd -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=OBD Auto Check" 2>/dev/null
fi
"$FERR/apksigner" sign --ks "$CHAVE" --ks-pass "file:$SENHA" --out "$OBRA/obd-auto-check.apk" "$OBRA/alinhado.apk"

# O próprio APK precisa provar o que promete.
PERM=$("$FERR/aapt2" dump permissions "$OBRA/obd-auto-check.apk" | sed -n "s/.*name='\([^']*\)'.*/\1/p")
for p in $PERM; do
  case "$p" in
    android.permission.BLUETOOTH|android.permission.BLUETOOTH_CONNECT) ;;
    obd.auto.check.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION) ;;
    *) echo "ERRO  permissão inesperada: $p" >&2; exit 1 ;;
  esac
done
"$FERR/apksigner" verify "$OBRA/obd-auto-check.apk"
echo "APK: $OBRA/obd-auto-check.apk"
