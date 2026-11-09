package obd.auto.check;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** O app só lê. A mesma lista de app/obd/protocolo.js; o guarda reprova se as duas divergirem. */
final class Comandos {
    private static final Set<String> AT_PERMITIDOS = new HashSet<>(Arrays.asList("ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATAT1", "ATSP0", "ATI", "ATRV", "ATDP", "ATDPN"));
    private static final Set<String> MODOS_LEITURA = new HashSet<>(Arrays.asList("01", "02", "03", "06", "07", "09", "0A"));

    private Comandos() {}

    static boolean permitido(String comando) {
        String c = comando.toUpperCase(Locale.ROOT).replace(" ", "");
        if (c.startsWith("AT")) return AT_PERMITIDOS.contains(c);
        return c.matches("[0-9A-F]+") && c.length() % 2 == 0 && MODOS_LEITURA.contains(c.substring(0, 2));
    }
}
