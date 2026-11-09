package obd.auto.check;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;

/** A tela do app: uma WebView que só enxerga os arquivos do próprio APK. */
public class MainActivity extends Activity {
    // Endereço reservado pelo Android para conteúdo local: nunca chega à rede, e tudo é respondido aqui.
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PEDIDO_ABRIR = 1;
    private static final int PEDIDO_SALVAR = 2;
    private static final int PEDIDO_PERMISSAO = 3;
    private static final Map<String, String> TIPOS = new HashMap<>();

    static {
        TIPOS.put("html", "text/html");
        TIPOS.put("js", "text/javascript");
        TIPOS.put("css", "text/css");
        TIPOS.put("json", "application/json");
        TIPOS.put("md", "text/plain");
    }

    private WebView web;
    private PonteNativa ponte;
    private ValueCallback<Uri[]> escolha;
    private String textoASalvar;
    private CountDownLatch esperaPermissao;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setBlockNetworkLoads(true);
        s.setGeolocationEnabled(false);
        s.setSafeBrowsingEnabled(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // Inspecionar a página só vale em compilações de teste.
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web.setWebViewClient(new ClienteLocal());
        web.setWebChromeClient(new ClienteArquivos());
        ponte = new PonteNativa(this, web);
        web.addJavascriptInterface(ponte, "ObdNativo");
        web.loadUrl(new Uri.Builder().scheme("https").authority(HOST).path("index.html").build().toString());
    }

    @Override
    protected void onDestroy() {
        ponte.encerrar();
        web.destroy();
        super.onDestroy();
    }

    private final class ClienteLocal extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
            return !HOST.equals(pedido.getUrl().getHost());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest pedido) {
            Uri u = pedido.getUrl();
            if (!HOST.equals(u.getHost()) || u.getPath() == null || u.getPath().contains("..")) return vazia(403, "Forbidden");
            try {
                String caminho = u.getPath().replaceFirst("^/", "");
                InputStream arquivo = getAssets().open("www/" + caminho);
                String ext = caminho.substring(caminho.lastIndexOf('.') + 1);
                String tipo = TIPOS.containsKey(ext) ? TIPOS.get(ext) : "application/octet-stream";
                Map<String, String> cabecalhos = new HashMap<>();
                cabecalhos.put("X-Content-Type-Options", "nosniff");
                return new WebResourceResponse(tipo, "utf-8", 200, "OK", cabecalhos, arquivo);
            } catch (IOException e) {
                return vazia(404, "Not Found");
            }
        }

        private WebResourceResponse vazia(int codigo, String motivo) {
            return new WebResourceResponse("text/plain", "utf-8", codigo, motivo, new HashMap<>(), new ByteArrayInputStream(new byte[0]));
        }
    }

    // Importar: o seletor do Android devolve só o arquivo que a pessoa escolheu.
    private final class ClienteArquivos extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> retorno, FileChooserParams p) {
            if (escolha != null) escolha.onReceiveValue(null);
            escolha = retorno;
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            startActivityForResult(i, PEDIDO_ABRIR);
            return true;
        }
    }

    // Exportar: a pessoa escolhe onde o arquivo fica.
    void pedirOndeSalvar(String nome, String tipo, String texto) {
        runOnUiThread(() -> {
            textoASalvar = texto;
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(tipo).putExtra(Intent.EXTRA_TITLE, nome);
            startActivityForResult(i, PEDIDO_SALVAR);
        });
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        super.onActivityResult(pedido, resultado, dados);
        Uri uri = resultado == RESULT_OK && dados != null ? dados.getData() : null;
        if (pedido == PEDIDO_ABRIR && escolha != null) {
            escolha.onReceiveValue(uri == null ? null : new Uri[] {uri});
            escolha = null;
        }
        if (pedido == PEDIDO_SALVAR) {
            if (uri != null) gravar(uri);
            textoASalvar = null;
        }
    }

    private void gravar(Uri uri) {
        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
            out.write(textoASalvar.getBytes(StandardCharsets.UTF_8));
            Toast.makeText(this, "Arquivo salvo", Toast.LENGTH_SHORT).show();
        } catch (IOException | NullPointerException e) {
            Toast.makeText(this, "Não foi possível salvar o arquivo", Toast.LENGTH_LONG).show();
        }
    }

    // Chamado na fila da ponte, nunca na tela: espera a resposta da pessoa.
    boolean garantirPermissao(String permissao) throws InterruptedException {
        if (checkSelfPermission(permissao) == PackageManager.PERMISSION_GRANTED) return true;
        esperaPermissao = new CountDownLatch(1);
        runOnUiThread(() -> requestPermissions(new String[] {permissao}, PEDIDO_PERMISSAO));
        esperaPermissao.await();
        return checkSelfPermission(permissao) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int pedido, String[] permissoes, int[] resultados) {
        if (pedido == PEDIDO_PERMISSAO && esperaPermissao != null) esperaPermissao.countDown();
    }
}
