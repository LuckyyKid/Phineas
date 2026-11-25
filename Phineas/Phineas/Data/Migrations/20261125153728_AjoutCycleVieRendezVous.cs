using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Phineas.Data.Migrations
{
    /// <inheritdoc />
    public partial class AjoutCycleVieRendezVous : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DateModification",
                table: "RendezVousCommerciaux",
                type: "datetime(6)",
                nullable: true);

            // Fonctionnalité 23 : les rendez-vous enregistrés avant cette migration (F22) deviennent « Planifie », sans
            // autre changement (identifiant, opportunité, horaire, fuseau, durée, type, modalité, contenu).
            migrationBuilder.AddColumn<string>(
                name: "Statut",
                table: "RendezVousCommerciaux",
                type: "varchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Planifie")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "EvenementsRendezVousCommerciaux",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    RendezVousId = table.Column<int>(type: "int", nullable: false),
                    Type = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    AuteurId = table.Column<string>(type: "varchar(450)", maxLength: 450, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    AncienDebutUtc = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    AncienneDureeMinutes = table.Column<int>(type: "int", nullable: true),
                    NouveauDebutUtc = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    NouvelleDureeMinutes = table.Column<int>(type: "int", nullable: true),
                    Champs = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvenementsRendezVousCommerciaux", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EvenementsRendezVousCommerciaux_AspNetUsers_AuteurId",
                        column: x => x.AuteurId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EvenementsRendezVousCommerciaux_RendezVousCommerciaux_Rendez~",
                        column: x => x.RendezVousId,
                        principalTable: "RendezVousCommerciaux",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_EvenementsRendezVousCommerciaux_AuteurId",
                table: "EvenementsRendezVousCommerciaux",
                column: "AuteurId");

            migrationBuilder.CreateIndex(
                name: "IX_EvenementsRendezVousCommerciaux_RendezVousId",
                table: "EvenementsRendezVousCommerciaux",
                column: "RendezVousId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EvenementsRendezVousCommerciaux");

            migrationBuilder.DropColumn(
                name: "DateModification",
                table: "RendezVousCommerciaux");

            migrationBuilder.DropColumn(
                name: "Statut",
                table: "RendezVousCommerciaux");
        }
    }
}
