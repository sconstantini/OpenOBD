package obd.auto.check;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** window.ObdNativo: Bluetooth clássico com o ELM327. Cada pedido responde depois, sem travar a tela. */
final class PonteNativa {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String SEM_RESPOSTA = "(sem resposta)";

    private final MainActivity atividade;
    private final WebView web;
    private final ExecutorService fila = Executors.newSingleThreadExecutor();
    private volatile BluetoothSocket socket;

    PonteNativa(MainActivity atividade, WebView web) {
        this.atividade = atividade;
        this.web = web;
    }

    @JavascriptInterface
    public void pedir(int id, String metodo, String argumentos) {
        fila.execute(() -> {
            try {
                responder(id, true, executar(metodo, new JSONArray(argumentos)));
            } catch (Exception e) {
                responder(id, false, e.getMessage() == null ? e.toString() : e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void salvar(String nome, String tipo, String texto) {
        atividade.pedirOndeSalvar(nome, tipo, texto);
    }

    // Fora da fila: a fila pode estar presa em connect() ou esperando resposta, e fechar o socket solta os dois.
    @JavascriptInterface
    public void interromper() {
        fechar();
    }

    private void responder(int id, boolean ok, String valor) {
        String v = valor == null ? "null" : JSONObject.quote(valor);
        web.post(() -> web.evaluateJavascript("window.obdNativoResposta(" + id + "," + ok + "," + v + ")", null));
    }

    private String executar(String metodo, JSONArray a) throws Exception {
        switch (metodo) {
            case "listar": return listar();
            case "abrir": abrir(a.getString(0)); return null;
            case "comando": return comando(a.getString(0), a.getInt(1));
            case "fechar": fechar(); return null;
            default: throw new IllegalArgumentException("método desconhecido");
        }
    }

    private BluetoothAdapter adaptador() throws Exception {
        if (Build.VERSION.SDK_INT >= 31 && !atividade.garantirPermissao(Manifest.permission.BLUETOOTH_CONNECT)) {
            throw new SecurityException("Permita o acesso aos dispositivos próximos para usar o adaptador.");
        }
        BluetoothManager m = (BluetoothManager) atividade.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter b = m == null ? null : m.getAdapter();
        if (b == null) throw new IOException("Este aparelho não tem Bluetooth.");
        if (!b.isEnabled()) throw new IOException("Ligue o Bluetooth do aparelho.");
        return b;
    }

    // Só aparelhos já pareados, em Configurações do Android: o app não varre o que está por perto.
    @SuppressLint("MissingPermission")
    private String listar() throws Exception {
        JSONArray lista = new JSONArray();
        for (BluetoothDevice d : adaptador().getBondedDevices()) {
            lista.put(new JSONObject().put("nome", d.getName() == null ? d.getAddress() : d.getName()).put("endereco", d.getAddress()));
        }
        return lista.toString();
    }

    @SuppressLint("MissingPermission")
    private void abrir(String endereco) throws Exception {
        if (!BluetoothAdapter.checkBluetoothAddress(endereco)) throw new IllegalArgumentException("endereço Bluetooth inválido");
        BluetoothAdapter b = adaptador();
        fechar();
        // Adaptadores baratos costumam recusar a conexão com criptografia.
        BluetoothSocket s = b.getRemoteDevice(endereco).createInsecureRfcommSocketToServiceRecord(SPP);
        socket = s;
        s.connect();
    }

    private String comando(String texto, int timeoutMs) throws IOException {
        if (!Comandos.permitido(texto)) throw new SecurityException("comando bloqueado: " + texto);
        BluetoothSocket s = socket;
        if (s == null) throw new IOException("adaptador não conectado");
        int tempo = Math.min(Math.max(timeoutMs, 100), 20000);
        try {
            InputStream in = s.getInputStream();
            OutputStream out = s.getOutputStream();
            while (in.available() > 0) in.read();
            out.write((texto + "\r").getBytes(StandardCharsets.US_ASCII));
            out.flush();
            String r = lerAtePrompt(in, tempo);
            if (r.indexOf('>') >= 0) return r;
            // O ELM pode estar ocupado: pede um prompt novo antes do próximo comando.
            out.write('\r');
            out.flush();
            lerAtePrompt(in, 1000);
            return (SEM_RESPOSTA + " " + r).trim();
        } catch (IOException e) {
            fechar();
            throw new IOException("conexão Bluetooth caiu: " + e.getMessage());
        }
    }

    private String lerAtePrompt(InputStream in, int tempoMs) throws IOException {
        StringBuilder r = new StringBuilder();
        long fim = System.currentTimeMillis() + tempoMs;
        while (socket != null && System.currentTimeMillis() < fim) {
            int n = in.available();
            if (n == 0) {
                try {
                    Thread.sleep(5);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
                continue;
            }
            byte[] b = new byte[n];
            int lidos = in.read(b);
            if (lidos < 0) throw new IOException("fim da conexão");
            r.append(new String(b, 0, lidos, StandardCharsets.US_ASCII));
            if (r.indexOf(">") >= 0) break;
        }
        return r.toString();
    }

    private synchronized void fechar() {
        if (socket == null) return;
        try {
            socket.close();
        } catch (IOException e) {
            // A conexão já tinha caído.
        }
        socket = null;
    }

    void encerrar() {
        fila.execute(this::fechar);
        fila.shutdown();
    }
}
