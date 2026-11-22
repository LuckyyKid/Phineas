# Construit l'image Docker de l'application Phineas (ASP.NET Core, .NET 10).
#
# Construire : docker build -t phineas .
# Lancer     : docker run -p 8080:8080 -e ConnectionStrings__DefaultConnection="Server=...;Port=3306;Database=phineas;User=phineas;Password=..." phineas
#
# L'application a besoin d'une base MySQL joignable : la chaîne de connexion
# se passe par la variable d'environnement ConnectionStrings__DefaultConnection.
# Les migrations sont appliquées au démarrage (voir Data/Seed/DbSeeder.cs).

# Étape 1 : compiler et publier l'application avec le SDK complet.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# On copie d'abord le .csproj seul pour que Docker garde en cache
# les paquets NuGet tant que les dépendances ne changent pas.
COPY Phineas/Phineas/Phineas.csproj Phineas/Phineas/
RUN dotnet restore Phineas/Phineas/Phineas.csproj

COPY Phineas/ Phineas/
RUN dotnet publish Phineas/Phineas/Phineas.csproj -c Release -o /app/publish --no-restore

# Étape 2 : image finale, plus légère, qui contient seulement le runtime.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Le conteneur écoute en HTTP sur le port 8080 (port par défaut des images .NET).
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .

# L'image .NET fournit l'utilisateur « app » : on évite de tourner en root.
USER app

ENTRYPOINT ["dotnet", "Phineas.dll"]
